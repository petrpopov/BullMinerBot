'use strict';

const fetch = require("node-fetch");
const config = require('dotenv').config();
const fs = require('fs');
var Miner = require('./miner.js')


function later(delay) {
    return new Promise(function(resolve) {
        setTimeout(resolve, delay);
    });
}
async function waitForLauncherIsReady() {
    while(true) {
        try {
            const res = await fetch('http://127.0.0.1:8080').then(response => response.text());
            if(res === 'Hello, World!') {
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
