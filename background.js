"use strict";

const ALARM_TIME = 60; // In seconds
const ALARM_BUFFER = 1.1; // Alarm usually triggers a little late
const IDLE_TIME = 300; // In seconds

let RESET_HOUR = 2;
let RESET_MIN = 20;

/****************** EVENTS *********************/

// Fires when a different/no window is in focus
chrome.windows.onFocusChanged.addListener(async windowId => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // If machine is locked, window also goes unfocused. Ignore in this case.
        const newState = await promisify(chrome.idle.queryState, IDLE_TIME);
        if (newState === "active") {
            console.log(`Chrome unfocused!`);
            await stopTracking("unfocused");
        }
    } else {
        console.log(`Chrome changed focus!`);
        await updateWithCurrentTab();
    }
});

// Fires when user switches tab
chrome.tabs.onActivated.addListener(async activeInfo => {
    // If window is closing, tab not found and throws error, so ignore.
    try {
        var tab = await safePromisify(chrome.tabs.get, activeInfo.tabId);
    } catch (e) {
        return; 
    }

    console.log(`New active tab!`);
    try {
        const prev = (await safePromisify(chrome.storage.local.get, 
            ["prevTab", "unfocused"]));
        const prevTab = prev.prevTab;
        const unfocused = prev.unfocused;
        if (unfocused) {
            console.log("Chrome previously unfocused, handled by other events.");
        }
        else if (tab.windowId === prevTab.windowId) {
            console.log(`Active tab in same window!`);
            await updateWithCurrentTab();
        } else {
            console.log(`Active tab in different window, handled by other events.`);
        }
    } catch (e) {
        console.error(e);
    }
});

// Fires when new page is loaded
chrome.webNavigation.onCompleted.addListener(async details => {
    // Only occurs if page is fully loaded
    if (details.frameId === 0) {
        console.log(`Loaded new page!`);
        const tab = await promisify(chrome.tabs.get, details.tabId);
        const tabWindow = await promisify(chrome.windows.get, tab.windowId);
        if (tab.active && tabWindow.focused) {
            console.log(`Loaded on focused, active tab!`);
            await updateWithCurrentTab();
        } else {
            console.log(`Loaded elsewhere (new tab, etc.)!`);
            console.log(`---------------------------------`);
        }
    }
});

// Detect if user is idle or not
chrome.idle.onStateChanged.addListener(async newState => {
    console.log(`Machine is ${newState}.`);
    if (newState !== "active") {
        await stopTracking("idle");
    } else {
        const currentWindow = await promisify(chrome.windows.getCurrent, {});
        try {
            // Idle event always late. If status still idle, update if necesary.
            const idle = (await safePromisify(chrome.storage.local.get, 
                "idle")).idle;
            await safePromisify(chrome.storage.local.remove, "idle");
            if (idle && currentWindow.focused) {
                await updateWithCurrentTab();
            } else {
                console.log("Active state handled by other events.");
                console.log(`---------------------------------`);
            }
        } catch (e) {
            console.error(e);
        }
    }
});

// Update time when alarm called
chrome.alarms.onAlarm.addListener(async alarm => {
    console.log(`Update from alarm "${alarm.name}" at ${new Date()}`);
    if (alarm.name === "update") {
        await updateWithCurrentTab();
    } else if (alarm.name === "reset") {
        const currentWindow = await promisify(chrome.windows.getCurrent, {});
        if (currentWindow.focused) {
            await updateWithCurrentTab();
        }
        await resetTracking();
    }
});

// Set time interval when user is active.
chrome.runtime.onInstalled.addListener(async details => {
    try {
        console.log(`Installing...`);
        await safePromisify(chrome.storage.local.clear);
        await promisify(chrome.alarms.clearAll);
        chrome.idle.setDetectionInterval(IDLE_TIME);
        const resetAlarm = await promisify(chrome.alarms.get, "reset");
        if (!resetAlarm) {
            await resetTracking();
        }
        await updateWithCurrentTab();
    } catch (e) {
        console.error(e);
    }
});

/****************** TIME TRACKING ******************/

async function updateWithCurrentTab() {
    try {
        await updateTime();
        // await trackCurrentTab();
        console.log(`Tracking current tab!`);
        const currentTab = (await promisify(chrome.tabs.query, 
            {currentWindow: true, active: true}))[0];;
        console.log(`Current url: ${getTLD(currentTab.url)}`);
        await safePromisify(chrome.storage.local.set, 
            {prevStart: new Date().getTime(), prevTab: currentTab});
        await safePromisify(chrome.storage.local.remove, ["idle", "unfocused"]);
        console.log(`Setting alarm.`);
        chrome.alarms.create("update", {"delayInMinutes": ALARM_TIME / 60});
        console.log(`---------------------------------`);
    } catch (e) {
        console.error(e);
    }
}

async function stopTracking(newStatus) {
    try {
        await updateTime();
        console.log(`Stopping time tracking.`);
        await safePromisify(chrome.storage.local.remove, "prevStart");
        if (newStatus === "idle") {
            await safePromisify(chrome.storage.local.set, {idle: true});
        } else {
            await safePromisify(chrome.storage.local.set, {unfocused: true});
            await safePromisify(chrome.storage.local.remove, "idle");
        }
        console.log(`Clearing alarm.`);
        console.log(`---------------------------------`);
        await promisify(chrome.alarms.clear, "update");
    } catch (e) {
        console.error(e);
    }
}

async function updateTime() {
    try {
        const prev = await safePromisify(chrome.storage.local.get, 
            ["prevStart", "prevTab"]);
        const prevStart = prev.prevStart;
        // Don't update if we weren't tracking time
        if (!prevStart) {
            return;
        }
        const timeSpent = (new Date().getTime() - prevStart) / 1000;
        // Don't add time if it's greater than alarm time (chrome probably closed)
        if (timeSpent < ALARM_TIME * ALARM_BUFFER) {
            const prevURL = getTLD(prev.prevTab.url);
            let timeData = (await safePromisify(chrome.storage.local.get, 
                "timeData")).timeData;
            let todayData = timeData[timeData.length - 1];
            let prevURLTime = todayData[prevURL];
            if (!prevURLTime) {
                prevURLTime = 0;
            }
            console.log(`Updating website time!`);
            console.log(`Prev url: ${prevURL}`);
            console.log(`Time just spent on prev URL: ${timeSpent}`);
            todayData[prevURL] = prevURLTime + timeSpent;
            await safePromisify(chrome.storage.local.set, {timeData: timeData});
        }
    } catch (e) {
        console.error(e);
    }
}

async function resetTracking() {
    try {
        console.log(`Resetting time tracking!`);
        const now = new Date();
        // const resetDate = new Date(now.getFullYear(), now.getMonth(), 
        //     now.getDate() + 1, RESET_HOUR, RESET_MIN);

        // TEMP LINES
        const resetDate = new Date(now.getFullYear(), now.getMonth(), 
            now.getDate(), RESET_HOUR, RESET_MIN);
        RESET_MIN++;

        console.log(`New reset timer at ${resetDate}.`);
        chrome.alarms.create("reset", {when: resetDate.getTime()});
        let timeData = (await safePromisify(chrome.storage.local.get, 
                "timeData")).timeData;
        if (!timeData) {
            timeData = [{startTime: now.getTime(), endTime: resetDate.getTime()}];
        } else {
            timeData.push({startTime: timeData[timeData.length - 1].endTime, 
                endTime: resetDate.getTime()});
        }
        await safePromisify(chrome.storage.local.set, {timeData: timeData});
        console.log(`---------------------------------`);
    } catch (e) {
        console.error(e);
    }
}

/**************** HELPER/DEBUGGER FUNCTIONS ******************/

chrome.storage.onChanged.addListener((changes, areaName) => {
    for (const i in changes) {
        console.log(`Key: ${i} \n` + `oldValue: ${changes[i].oldValue} \n` +
            `newValue: ${changes[i].newValue}`);
    }
});

// Get top level domain name
// E.g. http://store.google.com/xyz -> http://store.google.com
function getTLD(thisURL) {
    const regex = /^(\S+?:\/\/[^\/]+).*$/;
    return thisURL.match(regex)[1];
}

// Converts ordinary callbacks w/ no errors to promise
function promisify(op, arg) {
    return new Promise((resolve, reject) => {
        if (arg) {
            op(arg, retVal => resolve(retVal));
        } else {
            op(retVal => resolve(retVal));
        }
    });
}

// Performs the memory op with the given arg and checks that it succeeded
function safePromisify(op, arg) {
    return new Promise((resolve, reject) => {
        if (arg) {
            op(arg, retVal => chrome.runtime.lastError ? 
                reject(chrome.runtime.lastError) : resolve(retVal));
        } else {
            op(retVal => chrome.runtime.lastError ? 
                reject(chrome.runtime.lastError) : resolve(retVal));
        }
    });
}