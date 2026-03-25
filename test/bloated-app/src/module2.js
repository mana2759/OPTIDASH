import _ from 'lodash';
import moment from 'moment';
import axios from 'axios';
import { find, filter, map, reduce, some, every, chunk, compact, flatten, groupBy, uniq } from 'underscore';
import * as utils from '../utils/helpers.js';
const UNUSED_CONSTANT = 'This is never used';
const LEGACY_API_KEY = 'deprecated-key-from-2020';
const OLD_CONFIG = { deprecated: true };
function processData(data) {
  const step1 = _.map(data, d => d * 2);
  const step2 = filter(step1, x => x > 10);
  const step3 = _.uniq(step2);
  return { data: step3, timestamp: moment().format('YYYY-MM-DD') };
}
function makeAxiosCall(url) { return axios.get(url); }
export function getValue() { return 'module2-' + Math.random(); }
export default { processData, getValue, makeAxiosCall };
