#!/usr/bin/env node

import meow from 'meow';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { buildThemeCSS } from './theme-css';
import { genColorLess } from './color-less';
import { getJSON } from './utils';
import { Config } from './types';

const cli = meow({
  help: `
  Usage
    ng-yunzai-plugin-theme
  Example
    ng-yunzai-plugin-theme -t=themeCss -c=ng-yunzai.json
  Options
    -t, --type    Can be set 'themeCss', 'colorLess'
    -c, --config  A filepath of NG-YUNZAI config script
    -d, --debug   Debug mode
  `,
  flags: {
    type: {
      type: 'string',
      default: 'themeCss',
      alias: 't',
    },
    config: {
      type: 'string',
      default: 'ng-yunzai.json',
      alias: 'c',
    },
    debug: {
      type: 'boolean',
      default: false,
      alias: 'd',
    },
  },
});

let config: { theme: Config; colorLess: Config; [key: string]: Config };

try {
  const configFile = resolve(process.cwd(), cli.flags.config);
  if (existsSync(configFile)) {
    config = getJSON(configFile);
  } else {
    console.error(`The config file '${cli.flags.config}' will not found`);
    process.exit(1);
  }
} catch (err) {
  console.error('Invalid config file', err);
  process.exit(1);
}

if (cli.flags.debug === true) {
  ['theme', 'colorLess'].forEach(key => {
    const item = config[key] || {};
    item.debug = true;
    config[key] = item;
  });
}

if (cli.flags.type === 'themeCss') {
  buildThemeCSS(config.theme);
} else if (cli.flags.type === 'colorLess') {
  genColorLess(config.colorLess);
} else {
  throw new Error(`Invalid type, can be set themeCss or colorLess value`);
}
