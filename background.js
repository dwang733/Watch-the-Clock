"use strict";

/****************** EVENTS *********************/

// Fires when a different/no window is in focus
chrome.windows.onFocusChanged.addListener(windowId => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        console.log(`Chrome unfocused!`);
        stopTracking("unfocused");
    } else {
        console.log(`Chrome changed focus!`);
        updateWithCurrentTab();
    }
});

// Fires when user switches tab
chrome.tabs.onActivated.addListener(async activeInfo => {
    // If window is closing, tab not found and throws error, so ignore.
    try {
        var tab = await safeChromeOp(chrome.tabs.get, activeInfo.tabId);
    } catch (err) {
        return; 
    }

    console.log(`New active tab!`);
    try {
        const prev = (await safeChromeOp(chrome.storage.local.get, 
            ["prevStatus", "prevTab"]));
        const prevStatus = prev["prevStatus"];
        const prevTab = prev["prevTab"];
        if (prevStatus === "unfocused") {
            console.log("Chrome previously unfocused, handled by other events.");
        }
        else if (tab.windowId === prevTab.windowId) {
            console.log(`Active tab in same window!`);
            updateWithCurrentTab();
        } else {
            console.log(`Active tab in different window, handled by other events.`);
        }
    } catch (err) {
        console.error(err);
    }
});

// Fires when new page is loaded
chrome.webNavigation.onCompleted.addListener(details => {
    // Only occurs if page is fully loaded
    if (details.frameId === 0) {
        console.log(`Loaded new page!`);
        chrome.tabs.get(details.tabId, tab => {
            chrome.windows.get(tab.windowId, window => {
                if (tab.active && window.focused) {
                    console.log(`Loaded on focused, active tab!`);
                    updateWithCurrentTab();
                } else {
                    console.log(`Loaded elsewhere (new tab, etc.)!`);
                    console.log(`---------------------------------`);
                }
            });
        });
    }
});

// Detect if user is idle or not
chrome.idle.onStateChanged.addListener(newState => {
    console.log(`Machine is ${newState}.`);
    if (newState !== "active") {
        stopTracking("idle");
    } else {
        chrome.windows.getCurrent({}, async window => {
            // Idle event always late. If status still idle, update if necesary.
            const isIdle = (await safeChromeOp(chrome.storage.local.get, 
                "isIdle"))["isIdle"];
            if (isIdle && window.focused) {
                updateWithCurrentTab();
            } else {
                console.log("Active state handled by other events.");
                console.log(`---------------------------------`);
            }
        });
    }
});

// Update time when alarm called
chrome.alarms.onAlarm.addListener(alarm => {
    console.log(`Update from alarm at ${new Date().toLocaleTimeString()}`);
    updateWithCurrentTab();
});

// Set time interval when user is active.
chrome.runtime.onInstalled.addListener(async details => {
    console.log(`Installing...`);
    chrome.idle.setDetectionInterval(15);
    await trackCurrentTab();
    console.log(`---------------------------------`);
});

/****************** TIME TRACKING ******************/

async function updateWithCurrentTab() {
    try {
        if ((await getCurrentTab()).status === "loading") {
            console.log("Tab still loading, stop tracking time.");
            stopTracking("loading");
        } else {
            await updateTime();
            await trackCurrentTab();
            await safeChromeOp(chrome.storage.local.remove, "isIdle");
            console.log(`Setting alarm.`);
            chrome.alarms.create("Update Time", {"delayInMinutes": 1});
            console.log(`---------------------------------`);
        }
    } catch (err) {
        console.error(err);
    }
}

async function stopTracking(newStatus) {
    try {
        await updateTime();
        console.log(`Stopping time tracking.`);
        await safeChromeOp(chrome.storage.local.remove, "prevStart");
        if (newStatus === "idle") {
            await safeChromeOp(chrome.storage.local.set, {"isIdle": true});
        } else {
            await safeChromeOp(chrome.storage.local.set, {"prevStatus": newStatus});
            await safeChromeOp(chrome.storage.local.remove, "isIdle");
        }
        console.log(`Clearing alarm.`);
        console.log(`---------------------------------`);
        chrome.alarms.clear("Update Time");
    } catch (err) {
        console.error(err);
    }
}

async function updateTime() {
    const prev = await safeChromeOp(chrome.storage.local.get, 
        ["prevStart", "prevTab"]);
    const prevStart = prev["prevStart"];
    const prevTab = prev["prevTab"];
    if (!prevStart) return; // Don't update if chrome was unfocused
    const prevURL = getTLD(prevTab.url);
    const prevURLTime = (await safeChromeOp(chrome.storage.local.get, 
        {[prevURL]: 0}))[prevURL];
    const timeSpent = (new Date().getTime() - prevStart) / 1000;
    // Don't add time if it's greater than alarm time (chrome probably closed)
    if (timeSpent < 60 * 1.1) {
        console.log(`Updating website time!`);
        console.log(`Prev url: ${prevURL}`);
        console.log(`Time just spent on prev URL: ${timeSpent}`);
        const setObj = {[prevURL]: prevURLTime + timeSpent};
        await safeChromeOp(chrome.storage.local.set, setObj);
    }
}

async function trackCurrentTab() {
    console.log(`Tracking current tab!`);
    const currentTab = await getCurrentTab();
    const setObj = {
        "prevStart": new Date().getTime(),
        "prevStatus": "complete",
        "prevTab": currentTab
    };
    console.log(`Current url: ${getTLD(currentTab.url)}`);
    await safeChromeOp(chrome.storage.local.set, setObj);
}

/**************** HELPER/DEBUGGER FUNCTIONS ******************/

chrome.storage.onChanged.addListener((changes, areaName) => {
    for (const i in changes) {
        console.log(`Key: ${i} \n` + `oldValue: ${changes[i]["oldValue"]} \n` +
            `newValue: ${changes[i]["newValue"]}`);
    }
});

// Get top level domain name
// E.g. http://store.google.com/xyz -> http://store.google.com
function getTLD(thisURL) {
    const regex = /^(\S+?:\/\/[^\/]+).*$/;
    return thisURL.match(regex)[1];
}

// Performs the memory op with the given arg and checks that it succeeded
function safeChromeOp(op, arg) {
    return new Promise((resolve, reject) => {
        op(arg, retVal => chrome.runtime.lastError ? 
            reject(chrome.runtime.lastError) : resolve(retVal));
    });
}

function getCurrentTab() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({"currentWindow": true, "active": true}, tabs => {
            resolve(tabs[0]);
        });
    })
}