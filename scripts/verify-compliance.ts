// @ts-expect-error - es-observable-tests does not have type definitions
import * as compliance from 'es-observable-tests';

import { Observable } from '../src/observable';

async function main() {
  console.log('Running TC39 Observable compliance tests...');
  try {
    // es-observable-tests exports a runTests function
    await compliance.runTests(Observable);
    console.log('\n✅ All TC39 Observable compliance tests passed!');
  } catch (e) {
    console.error('\n❌ Compliance tests failed:');
    console.error(e);
    process.exit(1);
  }
}

main();
