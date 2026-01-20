/**
 * Path utility functions for common path operations
 */
const path = require('path');

/**
 * Gets the path to id-history.json file
 * @param {string} dataPackagePath - Path to Discord data package
 * @returns {string} Full path to id-history.json
 */
function getIdHistoryPath(dataPackagePath) {
    return path.join(dataPackagePath, 'messages', 'id-history.json');
}

/**
 * Gets the path to the messages folder
 * @param {string} dataPackagePath - Path to Discord data package
 * @returns {string} Full path to messages folder
 */
function getMessagesPath(dataPackagePath) {
    return path.join(dataPackagePath, 'messages');
}

/**
 * Gets the path to the account folder
 * @param {string} dataPackagePath - Path to Discord data package
 * @returns {string} Full path to account folder
 */
function getAccountPath(dataPackagePath) {
    return path.join(dataPackagePath, 'account');
}

/**
 * Gets the path to user.json file
 * @param {string} dataPackagePath - Path to Discord data package
 * @returns {string} Full path to user.json
 */
function getUserJsonPath(dataPackagePath) {
    return path.join(dataPackagePath, 'account', 'user.json');
}

module.exports = {
    getIdHistoryPath,
    getMessagesPath,
    getAccountPath,
    getUserJsonPath
};
