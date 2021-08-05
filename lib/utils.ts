import { JsonParseMode, parseJson } from '@angular-devkit/core/src/json';
import { readFileSync } from 'fs';
import { Config } from './types';

export function deepMergeKey(original: any, ingoreArray: boolean, ...objects: any[]): any {
  if (Array.isArray(original) || typeof original !== 'object') return original;

  const isObject = (v: any) => typeof v === 'object' || typeof v === 'function';

  const merge = (target: any, obj: any) => {
    Object.keys(obj)
      .filter(key => key !== '__proto__' && Object.prototype.hasOwnProperty.call(obj, key))
      .forEach(key => {
        const oldValue = obj[key];
        const newValue = target[key];
        if (!ingoreArray && Array.isArray(newValue)) {
          target[key] = [...newValue, ...oldValue];
        } else if (oldValue != null && isObject(oldValue) && newValue != null && isObject(newValue)) {
          target[key] = merge(newValue, oldValue);
        } else {
          target[key] = oldValue;
        }
      });
    return target;
  };

  objects.filter(v => isObject(v)).forEach(v => merge(original, v));

  return original;
}

export function getJSON(jsonFile: string): any {
  const content = readFileSync(jsonFile, 'utf-8');
  try {
    return parseJson(content, JsonParseMode.Loose);
  } catch (ex) {
    console.log(
      `Can't parse json file (${jsonFile}), pls check for comments or trailing commas, or validate json via https://jsonlint.com/`,
    );
    throw ex;
  }
}

export function d(config: Config, message: string, data?: any): void {
  if (config.debug === true) {
    console.log(`[debug] ${message}`);
    if (data) {
      console.log(JSON.stringify(data));
    }
  }
}
