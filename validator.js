/**
 * Handles validation with validators
 * Validators are objects composed like that:
 * { schema: object, validation: function(data, addError, options){} }
 * Created by grenat on 02/07/14.
 */
'use strict';

var env = require('jjv')();
var _   = require('lodash');
_.mixin(require('lodash-deep'));

var validationFunctions = {};
var replacements        = {};

env.defaultOptions.checkRequired = true;


/**
 * Normalize jjv errors
 * @param  {object} errors list of errors
 * @return {object}        the normalized list of errors
 */
function normalize(errors) {
    if(!_.isObject(errors)) {
        return errors;
    }
    if(errors.schema) {
        var tmp = errors.schema;
        delete errors.schema;
        if(_.all(tmp, function(val, key) { return /^[0-9]+/.test(key); })) {
            errors.invalid = true;
        } else {
            _.merge(errors, tmp);
        }
    }
    _.forOwn(errors, function(error, key) {
        errors[key] = normalize(error);
    });

    return errors;
}


/**
 * Add replacements to make
 * @param {object} newReplacements the new replacement rules
 */
exports.addReplacements = function(newReplacements) {
    replacements = _.merge(replacements, newReplacements);
}


/**
 * Make replacements in the errors
 * @param  {object} errors       list of errors
 * @param  {object} replacements list of replacements to add
 * @param  {array}  currentPath  current path
 * @return {object}              list of updated errors
 */
function makeReplacements(errors, replacements, currentPath) {
    currentPath = currentPath || [];
    var path    = currentPath.join('.');

    _.forOwn(errors, function(error, key) {
        var changed = false;
        _.forOwn(replacements, function(replacementValue, replacementPattern) {
            // Check if the path match the replacement rule (regexp or string)
            var finalPath = (path ? path + '.' : '') + key;
            var match = _.isRegExp(replacementPattern) ? finalPath.test(replacementPattern) : _.endsWith(finalPath, replacementPattern);
            if(match) {
                changed = true;
                // Replace value by deleting the key and adding every key in replacementValue
                delete errors[key];
                _.forOwn(replacementValue, function(errorValue, errorKey) {
                    _.deepSet(errors, errorKey, errorValue);
                });
            }
        });
        if(!changed) {
            currentPath.push(key);
            errors[key] = makeReplacements(error, replacements, currentPath);
            currentPath.pop();
        }
    });

    return errors;
}

/**
 * Validate data with a validator
 * The validation can be asynchronous
 * @param validationProfile object the validator schema and validation function
 * @param data object the data
 * @param callback the callback function
 * @param {object} [options] object the options of validation
 */
exports.validate = function(validationProfile, data, callback, options) {
    // JSON Schema validation
    options = options || {};
    var errors = env.validate(validationProfile.schema, data, options);
    var currentReplacements = _.merge(replacements, options.replacements || {});
    errors = errors ? makeReplacements(normalize(errors.validation), currentReplacements) : {};

    // Function to add an error to the list
    var addError = function (field, error) {
        var fieldPath = field;
        if(_.deepHas(errors, fieldPath)) {
            _.extend(_.deepGet(errors, fieldPath), error);
            return;
        }
        _.deepSet(errors, fieldPath, error);
    };

    // If there is no validation function, we can call the callback
    if(!_.isFunction(validationProfile.validation)) {
        callback && callback(!_.isEmpty(errors) ? errors : null, data);
        return;
    }

    var context = {
        addError: addError,
        options: options,
        errors: errors,
        done: function() { callback(!_.isEmpty(errors) ? errors : null, data); }
    };
    validationProfile.validation.call(context, data, errors);
};
