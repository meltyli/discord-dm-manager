const { ensureExportPath } = require('./file-utils');
const { promptUser, cleanInput } = require('./cli-helpers');

function resolveExportPath(input) {
    return ensureExportPath(input);
}

async function promptForConfigValue(key, currentValue, rlInterface) {
    const answer = await promptUser(`Enter value for ${key}: `, rlInterface);
    const cleaned = cleanInput(answer);
    
    if (key === 'EXPORT_PATH') {
        return resolveExportPath(cleaned);
    }
    
    return cleaned;
}

module.exports = {
    resolveExportPath,
    promptForConfigValue
};
