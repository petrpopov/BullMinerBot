'use strict';

const config = require('dotenv').config();
const fs = require('fs');
var Miner = require('./miner.js')


async function main() {
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
