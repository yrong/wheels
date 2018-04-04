'use strict';

const _ = require('lodash')
const schema = require('redis-json-schema')
const scirichon_cache = require('scirichon-cache')
const common = require('scirichon-common')

const replaceId = async (category,key,val)=>{
    if(_.isString(val[key])||common.isLegacyUserId(category,val[key])){
        let obj = await scirichon_cache.getItemByCategoryAndID(schema.getAncestorCategory(category),val[key].toString())
        if(!_.isEmpty(obj)){
            val[key] = obj
        }
    }
}

const replaceIdArray = async (category,key,val)=>{
    let objs = []
    for(let id of val[key]){
        if(_.isString(id)||common.isLegacyUserId(category,id)){
            let obj = await scirichon_cache.getItemByCategoryAndID(schema.getAncestorCategory(category),id.toString())
            if(!_.isEmpty(obj)){
                objs.push(obj)
            }
        }
    }
    if(val[key].length === objs.length) {
        val[key] = objs
    }
}

const replaceObj = async (val,props)=>{
    if(_.isObject(val)&&props){
        for(let key in props){
            if(val[key]&&props[key].schema){
                if(_.isString(val[key])){
                    await replaceId(props[key].schema,key,val)
                }
            }
        }
    }
    return val
}

const referencedObjectMapper = async (val,params)=>{
    let properties = schema.getSchemaProperties(val.category||params.category),objs,obj
    for (let key in val) {
        if (val[key] && properties[key]) {
            if(properties[key].type==='string'&&properties[key].schema){
                await replaceId(properties[key].schema,key,val)
            }
            else if(properties[key].type==='array'&&properties[key].items&&properties[key].items.type){
                if(properties[key].items.type==='string'&&properties[key].items.schema){
                    await replaceIdArray(properties[key].items.schema,key,val)
                }
                else if (properties[key].type === 'array' && properties[key].items.type === 'object') {
                    for (let entry of val[key]) {
                        entry = await replaceObj(entry, properties[key].items.properties)
                    }
                }

            }else if(properties[key].type==='object') {
                val[key] = await replaceObj(val[key], properties[key].properties)
            }
        }
    }
    return val
}

module.exports = {referencedObjectMapper}