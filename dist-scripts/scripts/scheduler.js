"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const google_sheets_1 = require("../src/lib/google-sheets");
async function main() {
    const sendEvent = (message) => {
        console.log(message);
    };
    try {
        await (0, google_sheets_1.processGoogleSheet)(sendEvent);
        console.log('Processing complete!');
        process.exit(0);
    }
    catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}
main();
