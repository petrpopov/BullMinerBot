'use strict';

const config = require('dotenv').config();
const fs = require('fs');
const spawn = require('child_process').spawn;
const axios = require('axios');
var Miner = require('./miner.js')


function later(delay) {
    return new Promise(function(resolve) {
        setTimeout(resolve, delay);
    });
}

async function launchTGServer() {
    console.log("Launching TG server...")
    var args = spawn("python3",  ["server/launcher.py"]);

    args.stdout.setEncoding('utf8');
    args.stdout.on('data', function (data) {
        var str = data.toString()
        var lines = str.split(/(\r?\n)/g);
        console.log(lines.join(""));
    });

    args.on('close', function (code) {
        console.log('process exit code ' + code);
    });
}

async function waitForLauncherIsReady() {
    while(true) {
        try {
            const {data} = await axios.get("http://127.0.0.1:8080");
            // const res = await fetch('http://127.0.0.1:8080').then(response => response.text());
            if(data === 'Hello, World!') {
                return true;
            } else {
                console.log('Unknown response from TG Launcher, cannot proceed');
                return false;
            }
        }
        catch (e) {
            console.log("TG Launcher not found, waiting...");
            await later(1000);
        }
    }
}

async function main() {
    await launchTGServer();

    const tgResult = await waitForLauncherIsReady();
    if(tgResult === false) {
        console.log("TG Launcher not found, cannot proceed, exiting");
        process.exit(0);
        return;
    }

    console.log("TG Launcher found, proceeding");
    var promiseArgs = [];
    fs.readdir('sessions', (err, files) => {
        files.forEach(file => {
            if(!file.includes(".session")) {
                return;
            }

            const username = file.substring(5, file.indexOf(".session"));
            console.log('Found session name: %s', username);
            let miner = new Miner(username);
            promiseArgs.push(miner.run());
        });
    });

    await Promise.all(promiseArgs);
    console.log('All miners are ready');
}
main();
