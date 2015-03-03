/**
 * Handles validation with validators
 * Validators are objects composed like that:
 * { schema: object, validation: function(data, addError, options){} }
 * Created by grenat on 02/07/14.
 */
'use strict';

var env = require('jjv')();
var _ = require('lodash');
_.mixin(require('lodash-deep'));

var validationFunctions = {};

env.defaultOptions.checkRequired = true;

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
        if(key === 'minItems' || key === 'maxItems') {
            errors['wrongCount'] = true;
            delete errors[key];
        } else if(key === 'type' || key === 'enum') {
            errors['invalid'] = true;
            delete errors[key];
        } else if(key === 'uniqueItems') {
            errors['duplicate'] = true;
            delete errors[key];
        } else if(key === 'minLength') {
            errors['tooShort'] = true;
            delete errors[key];
        } else if(key === 'maxLength') {
            errors['tooLong'] = true;
            delete errors[key];
        } else {
            errors[key] = normalize(error);
        }
    });

    return errors;
}

/**
 * Load a validator
 * @param name string the name of the validator
 * @param schema object the validator (containing valid
 */
exports.load = function(name, validator) {
    validationFunctions[name] = validator.validation;
    env.addSchema(name, validator.schema);
};

/**
 * Returns whether there is a schema with the given name loaded or not
 * @param schemaName : name of the schema
 * @returns boolean
 */
exports.hasSchema = function(schemaName) {
    return _.keys(validationFunctions).indexOf(schemaName) !== -1;
};

/**
 * Validate data with a validator
 * The validation can be asynchronous
 * @param validatorName string the name of the object
 * @param data object the data
 * @param callback the callback function
 * @param {object} [options] object the options of validation
 */
exports.validate = function(validatorName, data, callback, options) {
    // JSON Schema validation
    var errors = env.validate(validatorName, data, options);
    errors = errors ? normalize(errors.validation) : {};

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
    if(!validationFunctions[validatorName]) {
        callback && callback(errors, data);
        return;
    }

    var context = {
        addError: addError,
        options: options,
        errors: errors,
        done: function() { callback(errors, data); }
    };
    validationFunctions[validatorName].call(context, data, errors);
    return;
};
