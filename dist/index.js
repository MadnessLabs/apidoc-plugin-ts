"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ts_simple_ast_1 = require("ts-simple-ast");
var ast = new ts_simple_ast_1.default();
function init(app) {
    app.addHook('parser-find-elements', parseElements, 200);
}
exports.init = init;
function parseElements(elements, element, block, filename) {
    if (element.name === 'apiinterface') {
        elements.pop();
        var newElements = [];
        var values = parse(element.content);
        var namedInterface = values.interface.trim();
        var interfacePath = values.path ? values.path.trim() : filename;
        var matchedInterface = getInterface(interfacePath, namedInterface);
        if (matchedInterface) {
            setInterfaceElements(matchedInterface, interfacePath, newElements, values);
            for (var i = 0, l = newElements.length; i < l; i++) {
                elements.push(newElements[i]);
            }
        }
        else {
            console.log("Could not find interface " + namedInterface + " in file " + interfacePath);
        }
    }
    return elements;
}
function parse(content) {
    if (content.length === 0) {
        return null;
    }
    var parseRegExp = /^(?:\((.+?)\)){0,1}\s*\{(.+?)\}\s*(?:(.+))?/g;
    var matches = parseRegExp.exec(content);
    if (!matches) {
        return null;
    }
    return {
        element: matches[3] || 'apiSuccess',
        interface: matches[2],
        path: matches[1],
    };
}
function setInterfaceElements(matchedInterface, filename, newElements, values, inttype) {
    extendInterface(matchedInterface, filename, newElements, values, inttype);
    matchedInterface.getProperties().forEach(function (prop) {
        var typeDef = inttype ? inttype + "." + prop.getName() : prop.getName();
        var descriptionPrefix = inttype ? inttype + " > " : '';
        var propDocNode = prop.getDocNodes()[0];
        var propComment = propDocNode ? propDocNode.getComment() : prop.getName();
        var description = descriptionPrefix + propComment;
        var propType = prop.getType().getText();
        var propLabel = propType;
        var propTypeIsObject = !isNativeType(propType);
        if (propTypeIsObject) {
            var isArray = propType.includes('[]');
            propLabel = 'Object' + (isArray ? '[]' : '');
        }
        newElements.push(getParam("{" + capitalize(propLabel) + "} " + typeDef + " " + description, values.element));
        if (propTypeIsObject) {
            var typeInterface = getInterface(filename, propType.replace('[]', ''));
            if (typeInterface) {
                setInterfaceElements(typeInterface, filename, newElements, values, typeDef);
            }
            else {
                setObjectElements(prop, filename, newElements, values, typeDef);
            }
        }
    });
}
function setObjectElements(prop, filename, newElements, values, typeDef) {
    prop.getType().getProperties().forEach(function (property) {
        var valueDeclaration = property._compilerSymbol.valueDeclaration;
        var propName = property.getName();
        var typeDefLabel = typeDef + "." + propName;
        var propType = valueDeclaration.type.getText();
        var desc = (typeDef.replace(/\./g, ' &gt; ')) +
            ' &gt; ' + (valueDeclaration.jsDoc ? valueDeclaration.jsDoc[0].comment : propName);
        newElements.push(getParam("{" + capitalize(propType) + "} " + typeDefLabel + " " + desc));
        if (!isNativeType(propType)) {
            var typeInterface = getInterface(filename, propType);
            if (typeInterface) {
                setInterfaceElements(typeInterface, filename, newElements, values, typeDefLabel);
            }
            else {
                setObjectElements(property, filename, newElements, values, typeDef);
            }
        }
    });
}
function extendInterface(matchedInterface, interfacePath, newElements, values, inttype) {
    var extendedInterface = matchedInterface.getExtends()[0];
    if (extendedInterface) {
        var extendedInterfaceName = extendedInterface.compilerNode.expression.getText();
        var matchedExtendedInterface = getInterface(interfacePath, extendedInterfaceName);
        if (!matchedExtendedInterface) {
            var interfaceFile = ast.getOrAddSourceFile(interfacePath);
            var importPath = interfaceFile.getInterfaces()[0].getSourceFile().getText().match(new RegExp("import .*" + extendedInterfaceName + ".*"))[0].match(/(["'])(?:(?=(\\?))\2.)*?\1/)[0].replace(/['"]/g, '');
            var importPathParts = importPath.split('/');
            var importFile = importPathParts.slice(1).join('');
            var interfacePathParts = interfacePath.split('/');
            var interfaceDir = interfacePathParts[1];
            var interfaceExtension = interfacePathParts.pop().indexOf('.d.ts') >= 0 ? '.d.ts' : '.ts';
            interfacePath = "./" + (importPathParts[0] === '.' ? interfaceDir + '/' : null) + importFile + interfaceExtension;
            matchedExtendedInterface = getInterface(interfacePath, extendedInterfaceName);
        }
        extendInterface(matchedExtendedInterface, interfacePath, newElements, values);
        setInterfaceElements(matchedExtendedInterface, interfacePath, newElements, values, inttype);
    }
}
function getParam(param, type) {
    if (type === void 0) { type = 'apiSuccess'; }
    return {
        content: param + "\n",
        name: type.toLowerCase(),
        source: "@" + type + " " + param + "\n",
        sourceName: type,
    };
}
function getInterface(interfacePath, namedInterface) {
    var interfaceFile = ast.getOrAddSourceFile(interfacePath);
    return interfaceFile.getInterface(namedInterface);
}
function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
function isNativeType(propType) {
    var nativeTypes = ['boolean', 'string', 'number', 'Date', 'any'];
    return nativeTypes.indexOf(propType) >= 0;
}
