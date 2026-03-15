import fs from 'fs';
import yaml from 'js-yaml';

const filePath = process.argv[2];
const graderPath = process.argv[3];

if (!filePath || !graderPath) {
  console.log('Usage: node clean_assertions.mjs <config_file> <grader_path>');
  process.exit(1);
}

try {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const config = yaml.load(fileContent);

  if (!config.tests) {
    console.log('No tests found in config.');
    process.exit(0);
  }

  const cleanAsserts = (asserts) => {
    if (!asserts) return asserts;
    return asserts.map(assertion => {
      if (typeof assertion === 'object' && assertion.type && assertion.type.startsWith('promptfoo:redteam:')) {
        return {
          type: 'javascript',
          value: `file://${graderPath}`
        };
      }
      return assertion;
    });
  };

  config.tests.forEach(test => {
    if (test.assert) {
      test.assert = cleanAsserts(test.assert);
    }
  });

  if (config.defaultTest && config.defaultTest.assert) {
    config.defaultTest.assert = cleanAsserts(config.defaultTest.assert);
  }

  fs.writeFileSync(filePath, yaml.dump(config));
  console.log('Successfully cleaned assertions in', filePath);
} catch (e) {
  console.error('Error cleaning assertions:', e);
  process.exit(1);
}
