"use strict";

let timeDataIdx;

$("#clear").click(() => {
	chrome.storage.local.clear();
    updateWithCurrentTab();
});

$("#back").click(() => {
    timeDataIdx = Math.max(0, timeDataIdx - 1);
    displayTimes();
});

$("#forward").click(async () => {
    const timeData = (await safePromisify(chrome.storage.local.get, 
            "timeData")).timeData;
    timeDataIdx = Math.min(timeDataIdx + 1, timeData.length - 1);
    displayTimes();
});

init();

async function init() {
    const timeData = (await safePromisify(chrome.storage.local.get, 
            "timeData")).timeData;
    timeDataIdx = timeData.length - 1;
    displayTimes();
}

async function displayTimes() {
    try {
        $("#tbody tr").remove();
        const timeData = (await safePromisify(chrome.storage.local.get, 
            "timeData")).timeData;
        const sitesDict = timeData[timeDataIdx];
        let sites = Object.keys(sitesDict).map(key => [key, sitesDict[key]]);
        const privateVars = ["startTime", "endTime"];
        sites = sites.filter(row => privateVars.indexOf(row[0]) === -1);
        sites.sort((x, y) => y[1] - x[1]); // Sort from highest to lowest times
        let appendBody = ``;
        for (let i = 0; i < sites.length; i++) {
            let prettyTime = ``;
            let seconds = sites[i][1];
            if (seconds >= 3600) {
                const hours = Math.floor(seconds/3600);
                prettyTime += `${hours}h `;
                seconds -= hours * 3600;
            }
            if (seconds >= 60) {
                const mins = Math.floor(seconds/60);
                prettyTime += `${mins}m `;
                seconds -= mins * 60;
            }
            prettyTime += `${Math.round(seconds)}s`;
            appendBody += `<tr><td>${sites[i][0]}</td><td>${prettyTime}</td></tr>`
        }
        $("#tbody").append(appendBody);
    } catch (err) {
        console.error(err);
    }
}