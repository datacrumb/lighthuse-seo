import 'dotenv/config';
import { processGoogleSheet } from '../src/lib/google-sheets';

async function main() {
  const sendEvent = (message: string) => {
    console.log(message);
  };

  try {
    await processGoogleSheet(sendEvent);
    console.log('Processing complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();