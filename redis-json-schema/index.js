const Ajv = require('ajv')
const _ = require('lodash')
const ajv = new Ajv({ useDefaults: true })
const config = require('config')
const Model = require('redis-crud-fork')
const SchemaModel = Model('Schema')

let allSchemas={},dereferencedSchemas = {},routeSchemas = {},schemaRelations={},sortedSchemas=[]

const persitSchema = async (schema)=>{
    await SchemaModel.insert(schema)
}

const clearSchemas = async ()=>{
    await SchemaModel.deleteAll()
}

const checkSchema = (schema)=>{
    let property,key
    for(key in schema.properties){
        property = schema.properties[key]
        if(property.type==='array'&&property.items.type==='object'){
            throw new Error(`array field ${key} in schema ${schema.id} can not contain object`)
        }
    }
}

const buildSchemaRelation = (schema)=>{
    _.each(schema.allOf,(parent)=>{
        if(parent['$ref']){
            schemaRelations[parent['$ref']] = schemaRelations[parent['$ref']]||{}
            schemaRelations[parent['$ref']]['children'] = schemaRelations[parent['$ref']]['children']||[]
            schemaRelations[parent['$ref']]['children'].push(schema.id)
        }
    })
}

const loadSchema = async (schema, dereference=true, persistance=true)=>{
    checkSchema(schema)
    ajv.removeSchema(schema.id)
    ajv.addSchema(schema)
    if(persistance)
        await persitSchema(schema)
    allSchemas[schema.id] = schema
    buildSchemaRelation(schema)
    if(schema.route){
        routeSchemas[schema.id] = {route:schema.route}
        if(schema.searchable){
            routeSchemas[schema.id].searchable = schema.searchable
        }
    }
    if(dereference)
    {
        schema = dereferenceSchema(schema.id)
        dereferencedSchemas[schema.id]=schema
    }
}

const sortSchemas = ()=>{
    let noRefTypes=[],advancedTypes=[],otherTypes=[]
    for(let category in routeSchemas){
        if(routeSchemas[category].searchable){
            advancedTypes.push(category)
        }
        let no_referenced = true
        for(let key in allSchemas[category]['properties']){
            let val = allSchemas[category]['properties'][key]
            if(val.schema){
                no_referenced = false
                break
            }
        }
        if(no_referenced)
            noRefTypes.push(category)
    }
    otherTypes = _.difference(_.keys(routeSchemas), _.concat(noRefTypes,advancedTypes))
    return _.concat(noRefTypes,otherTypes,advancedTypes)
}

const loadSchemas = async ()=>{
    let schemas = await SchemaModel.findAll(),schema
    for(let schema of schemas){
        await loadSchema(schema,false,false)
    }
    for(let schema of schemas){
        schema = dereferenceSchema(schema.id)
        dereferencedSchemas[schema.id]=schema
    }
    sortedSchemas = sortSchemas()
    return schemas
}

const getSortedSchemas = ()=>{
    return sortedSchemas
}

const _getSchema = function (category) {
    let schema = ajv.getSchema(category)
    return schema?schema.schema:undefined
};

const extendSchema = function (schema) {
    if (_.has(schema, "$ref")) {
        schema = _.extend(schema, _getSchema(schema['$ref']));
        schema = _.omit(schema, "$ref");
    }
    if (_.has(schema, "allOf")) {
        schema.allOf = _.map(schema.allOf, function (schema) {
            return extendSchema(schema);
        })
    }
    return schema;
}

const dereferenceSchema = function (category) {
    let schema = _getSchema(category);
    schema = extendSchema(schema);
    return schema;
}

const traverseSchemaProperties = (schema,properties)=>{
    if(schema.properties){
        _.assign(properties,schema.properties)
    }
    else if(schema.allOf&&schema.allOf.length){
        _.each(schema.allOf,(sub_schema)=>{
            if(sub_schema.properties){
                _.assign(properties,sub_schema.properties)
            }else if(sub_schema.allOf){
                traverseSchemaProperties(sub_schema,properties)
            }
        })
    }
    return properties
}

const getSchemaProperties = (category)=>{
    let schema = dereferencedSchemas[category]
    let properties = {}
    traverseSchemaProperties(schema,properties)
    return properties
}

const traverseParentSchema = (schema,parents)=>{
    if(schema.allOf&&schema.allOf.length){
        _.each(schema.allOf,(sub_schema)=>{
            if(sub_schema.id){
                parents.push(sub_schema.id)
            }
            if(sub_schema.allOf)
                traverseParentSchema(sub_schema,parents)
        })
    }
    return parents
}

const getParentSchemas = (category) => {
    let labels = [category]
    let schema = dereferencedSchemas[category]
    labels = traverseParentSchema(schema,labels)
    return _.uniq(labels)
}

const traverseSchemaRefProperties = (properties,prefix='',refProperties)=>{
    _.each(properties,(val,key)=>{
        if(val.schema){
            refProperties.push({attr:prefix?prefix+'.'+key:key,schema:val.schema,type:val.type,relationship:val.relationship})
        }else if(val.type==='array'&&val.items.schema){
            refProperties.push({attr:prefix?prefix+'.'+key:key,schema:val.items.schema,type:val.type,item_type:val.items.type,relationship:val.items.relationship})
        }else if(val.type==='object'&&val.properties){
            traverseSchemaRefProperties(val.properties,key,refProperties)
        }
    })
    return refProperties
}

const getSchemaRefProperties = (category)=>{
    let properties = getSchemaProperties(category)
    let referenced_properties = []
    traverseSchemaRefProperties(properties,'',referenced_properties)
    return referenced_properties
}

const getSchemaObjectProperties = (category)=>{
    let properties = getSchemaProperties(category),objectFields = []
    _.each(properties,(val,key)=>{
        if(val.type==='object'){
            objectFields.push(key)
        }
    })
    return objectFields
}

const checkObject = function (params) {
    if(!params.data||!params.data.category){
        throw new Error("item does not contain category field!");
    }
    var valid = ajv.validate(params.data.category,params.data.fields);
    if(!valid){
        throw new Error(ajv.errorsText());
    }
    let additionalPropertyCheck = config.get('additionalPropertyCheck');
    if(additionalPropertyCheck)
        checkAdditionalProperty(params)
    return valid;
}

const checkAdditionalProperty = function(params){
    let properties = getSchemaProperties(params.data.category)
    for (let key in params.data.fields){
        if(!_.has(properties,key)){
            throw new Error(`additional property:${key}`)
        }
    }
}

const getSchemaHierarchy = (category)=>{
    let result = {name:category}
    if(schemaRelations[category].children){
        result.children = []
        for(let child of schemaRelations[category].children){
            if (schemaRelations[child]) {
                result.children.push(getSchemaHierarchy(child))
            }else{
                result.children.push({name:child})
            }
        }
    }
    return result
}

const getApiRoutesAll = ()=>{
    return routeSchemas
}

const isSchemaCrossed = (category1, category2)=>{
    return _.intersection(getParentSchemas(category1),getParentSchemas(category2)).length>0
}

const getRouteFromParentSchemas = (category)=>{
    let route,parentCategories = getParentSchemas(category)
    if(routeSchemas[category]){
        route = routeSchemas[category].route
    }else{
        for(let parent of parentCategories){
            if(routeSchemas[parent]){
                route = routeSchemas[parent].route
                break
            }
        }
    }
    return route
}

const getMemberType = (category)=>{
    let memberType = allSchemas[category].member,refProperties,result
    if(memberType){
        refProperties = getSchemaRefProperties(memberType)
        for(let refProperty of refProperties){
            if(refProperty.schema == category){
                result = {member:memberType,attr:refProperty.attr}
                break
            }
        }
    }
    return result
}

const isSubTypeAllowed = (category)=>{
    return _.includes(allSchemas[category].required,'subtype')
}

const getDynamicSeqField = (category)=>{
    return allSchemas[category].dynamicSeqField
}

const getAncestorSchemas = (category)=>{
    let parentCategories = getParentSchemas(category),parentCategory
    for(let parent of parentCategories){
        if(routeSchemas[parent]){
            parentCategory = parent
            break
        }
    }
    return parentCategory
}


module.exports = {checkSchema,loadSchema,persitSchema,clearSchemas,loadSchemas,getSchemaProperties,getSchemaObjectProperties,
    getSchemaRefProperties,getSortedSchemas,checkObject,getParentSchemas,getSchemaHierarchy,
    getApiRoutesAll,isSchemaCrossed,getRouteFromParentSchemas,getMemberType,isSubTypeAllowed,getDynamicSeqField,
    getAncestorSchemas}
