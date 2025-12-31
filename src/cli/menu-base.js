const { getLogger } = require('../logger');
const { clearScreen, getMenuChoice, safeWaitForKeyPress } = require('../lib/cli-helpers');

/**
 * Base class for CLI menus with common display and interaction patterns
 */
class MenuBase {
    constructor(rl, configManager) {
        this.rl = rl;
        this.configManager = configManager;
    }

    get options() {
        return this.configManager.config;
    }

    /**
     * Displays menu with logging pause/resume and returns user choice
     * @param {string} menuName - Name for logging
     * @param {Function} displayFn - Function to display menu options (called between pause/resume)
     * @returns {Promise<string>} User's menu choice
     */
    async showMenuScreen(menuName, displayFn) {
        clearScreen();
        getLogger().logOnly(`[MENU] ${menuName}`);
        
        getLogger().pause();
        displayFn();
        getLogger().resume();
        
        return await getMenuChoice(this.rl);
    }

    /**
     * Executes menu option with error handling and key press wait
     * @param {string} actionName - Name of action for logging
     * @param {Function} actionFn - Async function to execute
     * @param {boolean} waitAfter - Whether to wait for key press after (default: true)
     * @returns {Promise<boolean>} True if should continue menu loop, false to exit
     */
    async executeMenuAction(actionName, actionFn, waitAfter = true, options = {}) {
        clearScreen();
        getLogger().logOnly(`[ACTION] ${actionName}`);
        
        console.log(`\n${actionName}`);
        console.log('='.repeat(actionName.length));
        
        try {
            await actionFn();
            if (waitAfter) {
                await safeWaitForKeyPress(this.rl);
            }
            return true;
        } catch (error) {
            // Allow callers to suppress generic menu-level error output
            if (!options.suppressErrorOutput) {
                console.log('');
                console.error('Error:', error.message);
            }
            if (waitAfter) {
                await safeWaitForKeyPress(this.rl);
            }
            return true;
        }
    }

    /**
     * Standard menu loop pattern
     * @param {string} menuName - Menu name for logging
     * @param {Function} displayFn - Function to display menu
     * @param {Function} handleChoiceFn - Function to handle choice, returns false to exit
     * @returns {Promise<void>}
     */
    async runMenuLoop(menuName, displayFn, handleChoiceFn) {
        while (true) {
            const choice = await this.showMenuScreen(menuName, displayFn);
            
            const shouldContinue = await handleChoiceFn(choice);
            if (!shouldContinue) {
                return;
            }
        }
    }
}

module.exports = { MenuBase };
