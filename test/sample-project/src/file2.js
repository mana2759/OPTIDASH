import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const message = 'This file is intentionally bloated and has unused imports.';
const repeated = ['alpha','beta','gamma','delta','epsilon','zeta','eta','theta','iota','kappa'].join(' - ');

export function runFile2() {
  console.log(message);
  console.log(repeated);
  console.log('file2 ready');
}

runFile2();