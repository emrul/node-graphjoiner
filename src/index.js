import { flatMap, forEach, fromPairs, map, mapValues, partition, toPairs, uniq } from "lodash";
import { parse } from "graphql/language";
import { GraphQLObjectType, GraphQLList } from "graphql";

import JoinMap from "./JoinMap";

export function execute(root, query) {
    const request = requestFromGraphqlAst(parse(query).definitions[0]);
    return executeRequest(root, request);
}

function executeRequest(root, request) {
    return Promise.resolve(root.fetch(request)).then(result => result[0].value);
}

export function many({target, select, join, args}={}) {
    return new Relationship({
        target,
        select,
        join,
        args,
        processResults: x => x,
        wrapType: type => new GraphQLList(type)
    });
}

export function single({target, select, join, args}={}) {
    return new Relationship({
        target,
        select,
        join,
        args,
        processResults: singleValue,
        wrapType: type => type
    });
}

function singleValue(values) {
    if (values.length === 0) {
        return null;
    } else if (values.length === 1) {
        return values[0];
    } else {
        throw new Error("TODO");
    }
}

class RelationshipResults {
    constructor(options) {
        this._results = new JoinMap(options.results);
        this._processResults = options.processResults;
        this._parentJoinKeys = options.parentJoinKeys;
    }

    get(parent) {
        const parentJoinValues = this._parentJoinValues(parent);
        const values = this._results.get(parentJoinValues, []);
        return this._processResults(values);
    }

    _parentJoinValues(parent) {
        return this._parentJoinKeys.map(joinField => parent[joinField]);
    }
}

class Relationship {
    constructor(options) {
        this._target = options.target;
        this._select = options.select;
        this._join = toPairs(options.join || {});
        this._args = options.args || {};
        this._processResults = options.processResults;
        this.parentJoinKeys = this._join.map(pair => pair[0]);
        this._wrapType = options.wrapType;
    }

    fetch(request, selectParent) {
        const childRequest = {
            ...request,
            joinSelection: this._join.map(pair => createRequest({
                fieldName: pair[1],
                // TODO: generate key
                key: pair[1]
            }))
        };
        return Promise.resolve(this._select(request, selectParent)).then(select =>
            this._target.fetch(childRequest, select)
        )
        .then(results =>
            new RelationshipResults({
                results,
                parentJoinKeys: this.parentJoinKeys,
                processResults: this._processResults
            })
        );
    }

    toGraphQLField() {
        // TODO: differentiate between root and non-root types properly
        const resolve = this._join.length !== 0 ? resolveField : (source, args, context, info) => {
            const request = requestFromGraphqlAst(info.fieldASTs[0]);
            return this.fetch(request, null).then(results => results.get([]));
        };
        return {
            type: this._wrapType(this._target.toGraphQLType()),
            resolve: resolve,
            args: this._args
        };
    }
}

export class JoinType {
    constructor(options) {
        this._name = options.name;
        this.fetchImmediates = options.fetchImmediates;
        this._generateFields = options.fields;
        this._fields = null;
    }

    fields() {
        if (this._fields === null) {
            // TODO: add name to field definitions?
            this._fields = this._generateFields();
        }
        return this._fields;
    }

    fetch(request, select) {
        const fields = this.fields();

        const [relationshipSelection, requestedImmediateSelection] = partition(
            request.selection,
            field => fields[field.fieldName] instanceof Relationship
        );

        const joinToChildrenSelection = flatMap(
            relationshipSelection,
            field => fields[field.fieldName].parentJoinKeys.map(key => createRequest({
                // TODO: generate key
                fieldName: key,
                key: key
            }))
        );
        const immediateSelection = uniq(requestedImmediateSelection.concat(request.joinSelection).concat(joinToChildrenSelection));
        const immediatesRequest = {...request, selection: immediateSelection};
        return Promise.resolve(this.fetchImmediates(immediatesRequest, select)).then(results => {
            return Promise.all(map(relationshipSelection, fieldRequest => {
                return fields[fieldRequest.fieldName].fetch(fieldRequest, select).then(children => {
                    results.forEach(result => {
                        result[fieldRequest.key] = children.get(result);
                    })
                });
            })).then(() => results.map(result => ({
                value: fromPairs(request.selection.map(field => [field.key, result[field.key]])),
                joinValues: request.joinSelection.map(joinField => result[joinField.fieldName])
            })));
        });
    }

    toGraphQLType() {
        if (!this._graphQLType) {
            this._graphQLType = new GraphQLObjectType({
                name: this._name,
                fields: () => mapValues(this.fields(), field => field.toGraphQLField())
            });
        }
        return this._graphQLType;
    }
}

JoinType.field = function field(options) {
    return {
        ...options,
        toGraphQLField() {
            return {
                type: options.type,
                resolve: resolveField
            };
        }
    };
};

function resolveField(source, args, context, info) {
    return source[requestedFieldKey(info.fieldASTs[0])];
}

export class RootJoinType extends JoinType {
    constructor(options) {
        super({
            ...options,
            fetchImmediates: () => [{}]
        });
    }
}

function requestFromGraphqlAst(ast) {
    const isField = ast.kind === "Field";
    return createRequest({
        fieldName: isField ? requestedFieldName(ast) : null,
        key: isField ? requestedFieldKey(ast) : null,
        args: fromPairs(map(ast.arguments, argument => [argument.name.value, argument.value.value])),
        selection: graphqlChildren(ast)
    });
}

function graphqlChildren(ast) {
    if (ast.selectionSet) {
        return ast.selectionSet.selections.map(requestFromGraphqlAst);
    } else {
        return [];
    }
}

function createRequest(request) {
    return {
        fieldName: null,
        args: {},
        selection: [],
        joinSelection: [],
        ...request
    };
}

function requestedFieldName(ast) {
    return ast.name.value;
}

function requestedFieldKey(ast) {
    return ast.alias ? ast.alias.value : requestedFieldName(ast);
}
