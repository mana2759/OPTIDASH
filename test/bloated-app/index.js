// Main entry point for bloated app
import * as m1 from './src/module1.js';
import * as m2 from './src/module2.js';
import * as m3 from './src/module3.js';
import * as utils from './utils/helpers.js';

export function main() {
  console.log('Bloated app initialized');
  console.log('Value:', m1.getValue());
  return true;
}

main();
