import { readFileSync, writeFileSync } from "fs";

function main() {
  const filePath = "./dist/package.json"
  const content = JSON.parse(readFileSync(filePath).toString('utf8'));
  delete content.scripts;
  delete content.devDependencies;
  writeFileSync(filePath, JSON.stringify(content, null, 2));
}

main();
