import os
import glob
import asyncio
from flask import Flask
from flask import current_app
from waitress import serve
from itertools import cycle
from typing import Tuple

from pyrogram import Client
from pyrogram.errors import Unauthorized, UserDeactivated, AuthKeyUnregistered
from better_proxy import Proxy

from config.config import settings
from utils import logger
from exceptions import InvalidSession

app = Flask(__name__)

username_ids = {

}


@app.route('/')
def hello():
    return 'Hello, World!'

@app.route('/username/<username>')
async def get_username_id(username: str):
    if not username:
        return "Provide username!"

    if username_ids and username_ids.get(username):
        return str(username_ids.get(username))

    launcher = current_app.config['launcher']
    client, proxy = launcher.get_client_and_proxy(username)
    if not client:
        launcher.tasks = launcher.get_tasks()
        client, proxy = launcher.get_client_and_proxy(username)
        if not client:
            return "-1"

    tg_id = await launcher.get_tg_id(client, username, proxy)
    username_ids[username] = tg_id
    return str(tg_id)


class Launcher:
    def __init__(self):
        logger.info(f"Detected {len(self.get_session_names())} sessions | {len(self.get_proxies())} proxies")
        self.tasks = self.get_tasks()

    def get_session_names(self) -> list[str]:
        session_names = glob.glob('sessions/*.session')
        session_names = [os.path.splitext(os.path.basename(file))[0] for file in session_names]

        return session_names

    def get_proxies(self) -> list[Proxy]:
        if settings.USE_PROXY_FROM_FILE:
            with open(file='server/config/proxies.txt', encoding='utf-8-sig') as file:
                proxies = [Proxy.from_str(proxy=row.strip()).as_url for row in file]
        else:
            proxies = []

        return proxies

    def get_tg_clients(self) -> list[Client]:
        session_names = self.get_session_names()

        if not session_names:
            raise FileNotFoundError("Not found session files")

        if not settings.API_ID or not settings.API_HASH:
            raise ValueError("API_ID and API_HASH not found in the .env file.")

        session_names = sorted(session_names, key=lambda x: (x.split('_')[0]))

        tg_clients = [Client(
            name=session_name,
            api_id=settings.API_ID,
            api_hash=settings.API_HASH,
            workdir='sessions/',
            plugins=dict(root='bot/plugins')
        ) for session_name in session_names]

        return tg_clients

    def create_tasks(self, tg_clients: list[Client]):
        proxies = self.get_proxies()
        proxies_cycle = cycle(proxies) if proxies else None

        tasks = []
        for tg_client in tg_clients:
            tasks.append({
                'tg_client': tg_client,
                'proxy': next(proxies_cycle) if proxies_cycle else None
            })

        return tasks

    def get_tasks(self):
        tg_clients = self.get_tg_clients()
        return self.create_tasks(tg_clients=tg_clients)

    def get_client_and_proxy(self, username: str) -> Tuple[Client, Proxy]:
        client = None
        proxy = None
        for task in self.tasks:
            cl = task['tg_client']
            name = cl.name
            if username.lower().strip() in name.lower().strip():
                client = cl
                proxy = task['proxy']
                break
        return client, proxy

    async def get_tg_id(self, tg_client, session_name: str, proxy: str | None) -> str:
        try:
            if proxy:
                proxy = Proxy.from_str(proxy)
                proxy_dict = dict(
                    scheme=proxy.protocol,
                    hostname=proxy.host,
                    port=proxy.port,
                    username=proxy.login,
                    password=proxy.password
                )
            else:
                proxy_dict = None

            tg_client.proxy = proxy_dict

            if not tg_client.is_connected:
                try:
                    await tg_client.connect()
                except (Unauthorized, UserDeactivated, AuthKeyUnregistered):
                    raise InvalidSession(session_name)

            # username = self.session_name[5:]
            user_peer_id = await tg_client.resolve_peer(session_name)

            if tg_client.is_connected:
                await tg_client.disconnect()
            return user_peer_id.user_id
        except InvalidSession as error:
            raise error
        except Exception as error:
            await asyncio.sleep(delay=7)


if __name__ == '__main__':
    launcher = Launcher()
    with app.app_context():
       current_app.config['launcher'] = launcher

    serve(app, host="0.0.0.0", port=8080)
    # app.run(host='localhost', port=8080)

