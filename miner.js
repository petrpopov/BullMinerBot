'use strict';

const fetch = require("node-fetch");
const signalR = require("@microsoft/signalr");
const { networkInterfaces } = require('os');

const host = "https://bullapp.online/hub";

function getMyIp() {
    const nets = networkInterfaces();
    const results = Object.create(null); // Or just '{}', an empty object

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
            const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
            if (net.family === familyV4Value && !net.internal) {
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
        }
    }

    if(Object.prototype.hasOwnProperty.call(results, 'en0')) {
        return results['en0'];
    }
    else if(Object.prototype.hasOwnProperty.call(results, 'eth0')) {
        return results['eth0'];
    }

    return "-1";
}

async function getIdByUsername(username) {
    const ip = getMyIp();
    const id = await fetch('http://' + ip + ':8080/username/' + username).then(response => response.json());
    return id;
}

async function getProxyByUsername(username) {
    try {
        const proxy = await fetch('http://' + getMyIp() + ':8080/proxy/' + username).then(response => response.json());
        return proxy;
    } catch (e) {
        console.error(e);
        return "-1";
    }
}

const PHASES = {
    CLAIM: 'CLAIM',
    DAILY: 'DAILY',
    UPGRADE_SPEED: 'UPGRADE_SPEED',
    UPGRADE_STORAGE: 'UPGRADE_STORAGE',

    INIT: 'INIT',
    ON_CLAIMED: 'ON_CLAIMED',
}

class Miner {
    constructor(username) {
        this.username = username;
        this.userId = -1;

        this.currentBalance = -1;
        this.currentClaimTimer = "";
        this.current_claim_remain = -1;

        this.speedIndex = -1;
        this.speedLevel = -1;
        this.boost2_next = null;
        this.speedLevels = [];

        this.storageIndex = -1;
        this.storageLevel = -1;
        this.boost1_next = null;
        this.storageLevels = [];
    }

    isDailyClaimPossible(self) {
        return self.dayliClaimPossible;
    }

    async processPhase(self, phase) {
        switch (phase) {
            case PHASES.CLAIM:
                return await self.hub.invoke('Claim', self.userId);
            case PHASES.DAILY:
                return await self.hub.invoke('DailyClaim', self.userId);
            case PHASES.UPGRADE_SPEED:
                return await self.hub.invoke('Boost1', self.userId);
            case PHASES.UPGRADE_STORAGE:
                return await self.hub.invoke('Boost2', self.userId);
            default:
                break
        }
    }

    async processNextPhase(self, data, phase) {
        switch (phase) {
            case PHASES.INIT:
                const claimtimer = data.o.claimtimer;
                self.currentClaimTimer = claimtimer;

                if(data.o.claim_remain !== undefined && data.o.claim_remain !== null) {
                    self.current_claim_remain = data.o.claim_remain;
                }

                if(claimtimer === 'Filled') {
                    console.log('%s | Claim is possible, hot storage is filled, claiming', self.username);
                    return await self.processPhase(self, "CLAIM");
                }
                else {
                    return await self.upgradeSpeedIfPossible(self, data);
                }
            case PHASES.ON_CLAIMED:
                return await self.upgradeSpeedIfPossible(self);
            case PHASES.UPGRADE_SPEED:
                return await self.upgradeStorageIfPossible(self);
            case PHASES.UPGRADE_STORAGE:
                return await self.continueWork(self);
            default:
                break;
        }
    }


    async processInit(self, data) {
        // console.log(data.o);
        const balance = data.o.balance;
        const storage = data.o.volume;
        const speed = data.o.bullhour;
        console.log('%s | Total balance %f BULL, hot balance %f BULL, speed %f BULL/hour', self.username, balance, storage, speed);

        // set speed and storage values
        self.speedIndex = data.o.boost2;
        self.speedLevel = self.speedIndex + 1;
        self.boost2_next = data.o.boost2_next;

        self.storageIndex = data.o.boost1;
        self.storageLevel = self.storageIndex + 1;
        self.boost1_next = data.o.boost1_next;

        self.currentBalance = balance;
        self.dayliClaimPossible = data.o.can;

        const checknews = data.o.checknews;
        if(checknews === true) {
            console.log('%s | need to check news, invoking CheckNewsPressed', self.username)
            await self.hub.invoke('CheckNewsPressed', self.userId);
        }

        await self.processNextPhase(self, data, 'INIT');
    }

    async upgradeSpeedIfPossible(self) {
        if(!process.env.UPGRADE_SPEED || process.env.UPGRADE_SPEED === false) {
            console.info("%s | Speed upgrading is not enabling in config, skipping this step", self.username);
            return await self.processNextPhase(self, null, PHASES.UPGRADE_SPEED);
        }

        if(self.speedLevel < 0) {
            console.error("%s | Speed level not set!", self.username);
            return await self.processNextPhase(self, null, PHASES.UPGRADE_SPEED);
        }

        if(self.speedLevel >= process.env.SPEED_MAX_LEVEL) {
            console.log("%s | Speed level is maximum due to config, upgrade is not possible", self.username);
            return await self.processNextPhase(self, null, PHASES.UPGRADE_SPEED);
        }

        if(!self.boost2_next) {
            console.log("%s | Speed level reached maximum level", self.username);
            return await self.processNextPhase(self, null, PHASES.UPGRADE_SPEED);
        }

        if(self.currentBalance < 0) {
            console.error("%s | Balance not set!", self.username);
            return await self.processNextPhase(self, null, PHASES.UPGRADE_SPEED);
        }

        const price = self.boost2_next.coins;
        const balance = self.currentBalance;
        if(balance >= price) {
            const nextLevel = speedLevel + 1;
            console.log("%s | Upgrading speed to level %d", nextLevel);
            return await self.processPhase(self, PHASES.UPGRADE_SPEED);
        }
        else {
            console.log("%s | Speed upgrade is not possible, balance is not enough, balance %f, price %f", self.username, balance, price);
            return await self.processNextPhase(self, null, PHASES.UPGRADE_SPEED);
        }
    }

    async upgradeStorageIfPossible(self) {
        if(!process.env.UPGRADE_STORAGE || process.env.UPGRADE_STORAGE === false) {
            console.info("%s | Storage upgrading is not enabling in config, skipping this step", self.username);
            return await self.processNextPhase(self, null, PHASES.UPGRADE_STORAGE);
        }

        if(self.storageLevel < 0) {
            console.error("%s | Speed level not set!", self.username);
            return await self.processNextPhase(self, null, PHASES.UPGRADE_STORAGE);
        }

        if(self.storageLevel >= process.env.STORAGE_MAX_LEVEL) {
            console.log("%s | Storage level is maximum due to config, upgrade is not possible", self.username);
            return await self.processNextPhase(self, null, PHASES.UPGRADE_STORAGE);
        }

        if(!self.boost1_next) {
            console.log("%s | Storage level reached maximum level", self.username);
            return await self.processNextPhase(self, null, PHASES.UPGRADE_STORAGE);
        }

        const price = self.boost1_next.coins;
        const balance = self.currentBalance;
        if(balance >= price) {
            const nextLevel = storageLevel + 1;
            console.log("%s | Upgrading speed to level %d", nextLevel);
            return await self.processPhase(self, PHASES.UPGRADE_STORAGE);
        }
        else {
            console.log("%s | Storage upgrade is not possible, balance is not enough, balance %f, price %f", self.username, balance, price);
            return await self.continueWork(self);
        }
    }

    async onClaimed(self, data) {
        const balance = data.o.balance;
        const speed = data.o.bullhour;
        console.log('%s | Claimed successfully, new balance %f BULL, speed %f BULL/hour', self.username, balance, speed);

        return self.processNextPhase(self, data, PHASES.ON_CLAIMED);
    }

    async onSpeedUpgraded(self, data) {
        const balance = data.o.balance;
        const speed = data.o.bullhour;
        console.log("%s | Speed upgraded successfully, new balance %f BULL, speed %f BULL/hour", self.username, balance, speed);

        self.currentBalance = balance;

        return await self.upgradeStorageIfPossible(self);
    }

    async onStorageUpgraded(self, data) {
        const balance = data.o.balance;
        const claimHours = data.o.claimHours;
        console.log('%s | Claimed successfully, new balance %f BULL, claim time %d hours', self.username, balance, claimHours);

        self.currentBalance = balance;

        return await self.continueWork(self);
    }

    async main(self) {
        console.log("%s | Running hub", self.username);
        self.hub.start().then(() => self.hub.invoke('Init', self.userId, "en"));
    }

    getSleepTimeForNextClaim(self) {
        if(self.current_claim_remain !== -1) {
            return self.current_claim_remain * 1000;
        }

        if(self.currentClaimTimer !== undefined && self.currentClaimTimer !== null && self.currentClaimTimer.length > 0) {
            const parts = self.currentClaimTimer.split(" ");
            if(parts.length < 2) {
                return process.env.DEFAULT_SLEEP * 1000;
            }

            const hIndex = parts[0].indexOf("h");
            const hours = parseInt(parts[0].substring(0, hIndex).trim());

            const mIndex = parts[1].indexOf("m");
            const minutes = parseInt(parts[1].substring(0, mIndex).trim());

            return (hIndex * 3600 + minutes * 60) * 1000;
        }

        return process.env.DEFAULT_SLEEP * 1000;
    }

    async continueWork(self) {
        if(self.isDailyClaimPossible(self)) {
            await self.processPhase(self, PHASES.DAILY);
        }

        const timeout = self.getSleepTimeForNextClaim(self);
        console.log("%s | Sleep %ds for the next claim", self.username, timeout/1000);
        await self.hub.stop().then(() => console.log("%s | Hub stopped", self.username));
        setTimeout(() => {
            self.main(self);
        }, timeout);
    }

    async run() {
        console.log('%s | Starting miner', this.username)
        const id = await getIdByUsername(this.username);
        if(id < 0) {
            console.error('Cannot get username %s id, exiting', this.username);
            return;
        }

        const proxy = await getProxyByUsername(this.username);
        if (typeof proxy === 'string' || proxy instanceof String) {
            console.log("%s | Proxy not found for account", this.username)
        }
        else {
            const proxyString = proxy.scheme + "://" + proxy.hostname + ":" + proxy.port;
            console.log("%s | Proxy not implemented", this.username);
        }

        let self = this;
        const hub = new signalR.HubConnectionBuilder().withUrl(host).withAutomaticReconnect().build();
        this.hub = hub;
        this.userId = id;

        hub.on('init_c', (data) => this.processInit(self, data));
        hub.on('claim_c', (data) => this.onClaimed(self, data));
        hub.on('boost_c1', (data) => this.onStorageUpgraded(self, data));
        hub.on('boost_c2', (data) => this.onSpeedUpgraded(self, data));

        hub.on('er', function (uid, text) {
            console.log('Error occured %s', text);
        });

        this.main(this);
    }
}

module.exports = Miner;