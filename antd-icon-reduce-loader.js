var parser = require("@babel/parser");
var loaderUtils = require('loader-utils');
var core = require("@babel/core");
var iconDist = require('@ant-design/icons/lib/dist');
var fs = require('fs');
var traverse = require("@babel/traverse").default;

var tempFilePath = '';
var initIcons = [];
var addIconArr = [];
var validTypeArr = ['Literal', 'StringLiteral'];
function isArray(arrLike) {
    return Object.prototype.toString.call(arrLike) === '[object Array]';
}

function searchIconByName(name, theme = 'outline') {
    if (!name) {
        return;
    }
    var themeLowercase = (theme === 'filled' ? 'fill' : theme).toLowerCase();
    var iconExportKey = Object.keys(iconDist).find((key) => {
        return iconDist[key].name.toLowerCase() === name && iconDist[key].theme === themeLowercase;
    });
    if (iconExportKey && addIconArr.indexOf(iconExportKey) < 0) {
        var iconObj = iconDist[iconExportKey];
        var content = `export {
    default as ${iconExportKey}
} from '@ant-design/icons/lib/${iconObj.theme}/${iconExportKey}';
`;
        writeTempFile(content, iconExportKey);
        addIconArr.push(iconExportKey);
    }
}

function writeTempFile(content, iconExportName) {
    if (!tempFilePath) {
        return;
    }
    if (!fs.existsSync(tempFilePath)) {
        fs.writeFileSync(tempFilePath, '');
    }
    var iconFileContent = fs.readFileSync(tempFilePath).toString();
    if (iconFileContent.indexOf(iconExportName) < 0) {
        fs.appendFileSync(tempFilePath, content);
    }
}

function parseOptions() {
    var options = loaderUtils.getOptions(this) || {};
    tempFilePath = options.filePath;
    initIcons = options.initIcons || [];
}

function isCreateIcon(astParam) {
    return isEleType(astParam, '_icon');
}
function isButton(astParam) {
    return isEleType(astParam, '_button');
}
function isEleType(astParam, evarype) {
    if (Object.hasOwnProperty.call(astParam, 'name')
        && astParam.name.toLowerCase() === evarype) {
        return true;
    }
    if (Object.hasOwnProperty.call(astParam, 'object')
        && astParam.object.name
        && astParam.object.name.toLowerCase() === evarype) {
        return true;
    }
    return false;
}
function getIconProps(astParam) {
    return getEleProps(astParam, ['type', 'theme'], true);
}
function getBtnProps(astParam) {
    return getEleProps(astParam, ['icon', 'loading']);
}
function isValidIconType(node) {
    return validTypeArr.indexOf(node.type) >= 0;
}
function getEleProps(astParam, propKeys = [], isIcon = false) {
    var result = {};
    if (isArray(astParam)) {
        for (var i = 0; i < astParam.length; i++) {
            var keyName = astParam[i].key && astParam[i].key.name;
            if (isIcon && keyName === 'type') { // Icon组件的type属性
                if (astParam[i].value.type === 'ConditionalExpression') { // type: condition ? 'eye' : 'eye-invisible',
                    result[keyName] = [];
                    if (isValidIconType(astParam[i].value.consequent)) {
                        result[keyName].push(astParam[i].value.consequent.value);
                    }
                    if (isValidIconType(astParam[i].value.alternate)) {
                        result[keyName].push(astParam[i].value.alternate.value);
                    }
                } else if (isValidIconType(astParam[i].value)) {
                    result[keyName] = astParam[i].value.value;
                }
            } else if (!isIcon && keyName === 'icon') {
                if (isValidIconType(astParam[i].value)) {
                    result[keyName] = astParam[i].value.value;
                }
            } else if (!isIcon && keyName === 'loading') {
                result.loading = true;
            } else if (propKeys.indexOf(keyName) >= 0 && astParam[i].value.value) {
                result[keyName] = astParam[i].value.value;
            }
        }
    }
    return result;
}
function initOptionIcons() {
    if (initIcons.length > 0) {
        initIcons.forEach(function(iconItem) {
            if (typeof iconItem === 'object') {
                searchIconByName(iconItem.type, iconItem.theme);
            } else {
                searchIconByName(iconItem);
            }
        });
    }
}
module.exports = function(source) {
    parseOptions.call(this);
    if (!fs.existsSync(tempFilePath)) {
        return source;
    }
    initOptionIcons();
    var ast = parser.parse(source, { sourceType: "module", plugins: ['dynamicImport'] });
    traverse(ast, {
        CallExpression: function(path) {
            if (path.node.callee && isArray(path.node.arguments)) {
                var { object, property } = path.node.callee;
                var [ Identifier, ObjectExpression ] = path.node.arguments;
                if (!object || !property || !ObjectExpression || !Identifier) {
                    return;
                }
                var isReactCreateFn = object.name === 'React'
                    && property.name === 'createElement';
                if (isReactCreateFn && isArray(ObjectExpression.properties)) {
                    if (isCreateIcon(Identifier)) {
                        var iconProps = getIconProps(ObjectExpression.properties);
                        if (Object.keys(iconProps).length > 0) {
                            var type = iconProps.type;
                            var theme = iconProps.theme || 'outline';
                            if (isArray(type)) {
                                type.forEach(function(item) {
                                    searchIconByName(item, theme);
                                });
                            } else {
                                searchIconByName(type, theme);
                            }
                        }
                    } else if (isButton(Identifier)) {
                        var btnProps = getBtnProps(ObjectExpression.properties);
                        Object.keys(btnProps).forEach(function(k) {
                            searchIconByName(k === 'loading' ? k : btnProps[k]);
                        });
                    }
                }
            }
        },
    });
    return core.transformFromAstSync(ast).code;
};