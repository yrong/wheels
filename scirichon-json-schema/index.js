const Ajv = require('ajv')
const _ = require('lodash')
const ajv = new Ajv({ useDefaults: true })
const Redis = require('redis')
const Model = require('redis-crud-fork')

let allSchemas={},dereferencedSchemas = {},schemaRelations={},SchemaModel,additionalPropertyCheck

const initialize = (option)=>{
    if(!option.redisOption||!option.prefix){
        throw new Error('required option field missing when initialize schema:' + JSON.stringify(option))
    }
    let client = Redis.createClient(_.assign({db:option.redisOption.dbindex||1},option.redisOption))
    SchemaModel = Model(client,option.prefix)
    additionalPropertyCheck = option.additionalPropertyCheck
}

const persitSchema = async (schema)=>{
    await SchemaModel.insert(schema)
}

const clearSchemas = async ()=>{
    await SchemaModel.deleteAll()
}

const checkSchema = (schema)=>{
    if(_.isEmpty(schema)||_.isEmpty(schema.id)){
        throw new Error('schema not valid:' + JSON.stringify(schema))
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
    if(dereference)
        dereferencedSchemas[schema.id]=dereferenceSchema(schema.id)
}

const loadSchemas = async (option)=>{
    if(option)
        initialize(option)
    let schemas = await SchemaModel.findAll(),schema
    if(!schemas.length){
        throw new Error('no schemas found')
    }
    for(let schema of schemas){
        await loadSchema(schema,false,false)
    }
    for(let schema of schemas){
        schema = dereferenceSchema(schema.id)
        dereferencedSchemas[schema.id]=schema
    }
    return schemas
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
    if(!schema){
        throw new Error(`${category} schema not found`)
    }
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

const getParentCategories = (category) => {
    let labels = [category]
    let schema = dereferencedSchemas[category]
    if(!schema){
        throw new Error(`${category} schema not found`)
    }
    labels = traverseParentSchema(schema,labels)
    return _.uniq(labels)
}

const traverseSchemaRefProperties = (properties,prefix='',refProperties)=>{
    _.each(properties,(val,key)=>{
        if(val.schema){
            refProperties.push({attr:prefix?prefix+'.'+key:key,schema:val.schema,type:val.type,relationship:val.relationship})
        }else if(val.type==='array'){
            if(val.items.schema&&val.items.type!=='object'){
                refProperties.push({attr:prefix?prefix+'.'+key:key,schema:val.items.schema,type:val.type,item_type:val.items.type,relationship:val.items.relationship})
            }else if(val.items.type==='object'){
                for(let prop in val.items.properties){
                    if(val.items.properties[prop].schema){
                        refProperties.push({attr:key+'..'+prop,schema:val.items.properties[prop].schema,type:val.items.properties[prop].type,item_type:val.items.type,relationship:val.items.properties[prop].relationship})
                    }
                }

            }
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
        if(val.type==='object'||(val.type==='array'&&val.items.type==='object')){
            objectFields.push(key)
        }
    })
    return objectFields
}

const checkObject = function (category,object) {
    var valid = ajv.validate(category,object);
    if(!valid){
        throw new Error(ajv.errorsText());
    }
    if(additionalPropertyCheck)
        checkAdditionalProperty(category,object)
    return valid;
}

const checkAdditionalProperty = function(category,object){
    let properties = getSchemaProperties(category)
    for (let key in object){
        if(!_.has(properties,key)){
            throw new Error(`additional property:${key}`)
        }
    }
}

const getSchemaHierarchy = (category)=>{
    let result = {name:category}
    if(schemaRelations[category]&&schemaRelations[category].children){
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

const getRouteCategories = ()=>{
    return _.map(getApiRouteSchemas(),(schema)=>schema.id)
}

const getAncestorCategory = (category)=>{
    let parentCategories = getParentCategories(category),ancestorCategory=category
    let routeCategories = getRouteCategories()
    for(let parent of parentCategories){
        if(_.includes(routeCategories,parent)){
            ancestorCategory = parent
            break
        }
    }
    return ancestorCategory
}

const getSchema = (category)=>{
    return allSchemas[category]
}

const getSchemas = ()=>{
    return allSchemas
}

const getAncestorSchema = (category)=>{
    return getSchema(getAncestorCategory(category))
}

const getApiRouteSchemas = ()=>{
    return _.filter(allSchemas,(obj)=>{
        return !!obj.route
    })
}

module.exports = {
    getSchema, getSchemas, getApiRouteSchemas, checkSchema, getAncestorSchema,
    loadSchema, persitSchema, clearSchemas, loadSchemas,
    getSchemaProperties, getSchemaObjectProperties, getSchemaRefProperties,
    getParentCategories, getRouteCategories, getAncestorCategory,
    checkObject, initialize, getSchemaHierarchy
}
