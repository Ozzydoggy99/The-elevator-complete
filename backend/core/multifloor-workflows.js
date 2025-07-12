/**
 * Determines the appropriate workflow type based on template settings
 * @param {boolean} isMultifloor - Whether the template is configured for multifloor operation
 * @param {string} baseType - The base task type (pickup, dropoff, etc.)
 * @returns {string} The workflow type to use
 */
function determineWorkflowType(isMultifloor, baseType) {
    if (isMultifloor) {
        return `multifloor_${baseType}`;
    } else {
        return baseType;
    }
}

module.exports = {
    determineWorkflowType
};
