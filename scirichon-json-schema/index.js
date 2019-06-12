const Ajv = require('ajv')
const _ = require('lodash')
const ajv = new Ajv({ useDefaults: true,schemaId:'auto' })
const Redis = require('redis')
const Model = require('redis-crud-fork')
const fs = require('fs')

const initialize = (option)=>{
    if(!option.redisOption||!option.prefix){
        throw new Error('required option field missing when initialize schema:' + JSON.stringify(option))
    }
    global._scirichonSchemaModel = Model(Redis.createClient(_.assign({db:option.redisOption.dbindex||1},option.redisOption)),option.prefix)
    global._additionalPropertyCheck = option.additionalPropertyCheck
    global._scirichonSchema = {}
    global._scirichonSchemaRelation = {}
    global._scirichonSchemaDereferenced = {}
}

const initSchemas = async (option)=>{
    let json_schema_dir = `./schema`,files = fs.readdirSync(json_schema_dir),schma_obj
    initialize(option)
    for(let fileName of files){
        if(fileName.endsWith('.json')){
            schma_obj = JSON.parse(fs.readFileSync(json_schema_dir + '/' + fileName, 'utf8'))
            checkSchema(schma_obj)
            await global._scirichonSchemaModel.insert(schma_obj)
        }
    }
    await loadSchemas(option)
}

const clearSchemas = async ()=>{
    await global._scirichonSchemaModel.deleteAll()
}

const checkSchema = (schema)=>{
    if(_.isEmpty(schema)||_.isEmpty(schema.id)){
        throw new Error('schema not valid:' + JSON.stringify(schema))
    }
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

const loadSchema = async (schema)=>{
    checkSchema(schema)
    ajv.removeSchema(schema.id)
    ajv.addSchema(schema)
    global._scirichonSchema[schema.id] = schema
    _.each(schema.allOf,(parent)=>{
        if(parent['$ref']){
            global._scirichonSchemaRelation[parent['$ref']] = global._scirichonSchemaRelation[parent['$ref']]||{}
            global._scirichonSchemaRelation[parent['$ref']]['children'] = global._scirichonSchemaRelation[parent['$ref']]['children']||[]
            global._scirichonSchemaRelation[parent['$ref']]['children'].push(schema.id)
        }
    })
}

const loadSchemas = async (option)=>{
    if(option&&!global._scirichonSchemaModel)
        initialize(option)
    let schemas = await global._scirichonSchemaModel.findAll(),schema
    if(!schemas.length){
        throw new Error('no schemas found')
    }
    for(let schema of schemas){
        await loadSchema(schema)
    }
    for(let schema of schemas){
        schema = dereferenceSchema(schema.id)
        global._scirichonSchemaDereferenced[schema.id]=schema
    }
    return schemas
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
    let schema = global._scirichonSchemaDereferenced[category]
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
    let schema = global._scirichonSchemaDereferenced[category]
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

const checkAdditionalProperty = function(category,object){
    let properties = getSchemaProperties(category)
    for (let key in object){
        if(!_.has(properties,key)){
            throw new Error(`additional property:${key}`)
        }
    }
}

const checkObject = function (category,object) {
    var valid = ajv.validate(category,object);
    if(!valid){
        throw new Error(ajv.errorsText());
    }
    if(global._additionalPropertyCheck)
        checkAdditionalProperty(category,object)
    return valid;
}

const getSchemaHierarchy = (category)=>{
    let result = {name:category}
    if(global._scirichonSchemaRelation[category]&&global._scirichonSchemaRelation[category].children){
        result.children = []
        for(let child of global._scirichonSchemaRelation[category].children){
            if (global._scirichonSchemaRelation[child]) {
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
    return global._scirichonSchema[category]
}

const getSchemas = ()=>{
    return global._scirichonSchema
}

const getAncestorSchema = (category)=>{
    return getSchema(getAncestorCategory(category))
}

const getApiRouteSchemas = ()=>{
    return _.filter(global._scirichonSchema,(obj)=>{
        return !!obj.route
    })
}

module.exports = {
    getSchema, getSchemas, getApiRouteSchemas, checkSchema, getAncestorSchema,
    loadSchema, clearSchemas, loadSchemas,
    getSchemaProperties, getSchemaObjectProperties, getSchemaRefProperties,
    getParentCategories, getRouteCategories, getAncestorCategory,
    checkObject, initialize, getSchemaHierarchy,initSchemas
}
