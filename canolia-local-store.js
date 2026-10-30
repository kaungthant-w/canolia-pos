/* Durable browser storage. No business record is sent over the network here. */
(() => {
    if (globalThis.canoliaLocalStore) return;
    let database;
    let lease;
    let releaseLease;
    let hasLease = false;
    addEventListener("pagehide", () => { hasLease = false; releaseLease?.(); releaseLease = null; lease = null; });
    addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
    function openDatabase() {
        if (!database) database = new Promise((resolve, reject) => {
            const request = indexedDB.open("canolia-pos-local", 1);
            request.onupgradeneeded = () => request.result.createObjectStore("workspace");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error("Local storage could not open. Keep the existing browser data and retry."));
            request.onblocked = () => reject(new Error("Close the other Canolia tabs, then reload this page."));
        });
        return database;
    }
    globalThis.canoliaLocalStore = {
        acquire: () => {
            if (!lease) lease = new Promise((resolve, reject) => {
                if (!navigator.locks) {
                    reject(new Error("This browser does not support safe offline storage. Use an updated browser."));
                    return;
                }
                navigator.locks.request("canolia-pos-edit-workspace", { ifAvailable: true }, lock => {
                    if (!lock) { reject(new Error("Canolia is already open in another tab. Close it before editing here.")); return; }
                    hasLease = true;
                    resolve();
                    return new Promise(release => { releaseLease = release; });
                }).catch(reject);
            });
            return lease;
        },
        read: async () => {
            const db = await openDatabase();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction("workspace", "readonly");
                const request = transaction.objectStore("workspace").get("current");
                request.onsuccess = () => resolve(request.result ?? null);
                request.onerror = () => reject(new Error("Local records could not be read. Do not clear browser data."));
            });
        },
        write: async value => {
            if (!hasLease) throw new Error("The local workspace is not active. Reload before editing.");
            const db = await openDatabase();
            if (!hasLease) throw new Error("The local workspace is not active. Reload before editing.");
            return new Promise((resolve, reject) => {
                const transaction = db.transaction("workspace", "readwrite");
                transaction.objectStore("workspace").put(value, "current");
                transaction.oncomplete = () => resolve();
                transaction.onerror = transaction.onabort = () => reject(new Error("The local save failed. Check browser storage space before closing this page."));
            });
        },
        startupError: message => {
            document.body.textContent = message;
            document.body.style.whiteSpace = "pre-wrap";
            document.body.style.padding = "24px";
        }
    };
})();
