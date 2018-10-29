const _ = require('lodash')
const schema = require('scirichon-json-schema')
const jp = require('jsonpath')


/*********************************************crud cyphers**************************************************************/

/**
 * common template
 */
const addNodeCypher = (labels) => `MERGE (n:${labels} {uuid: {uuid}})
                                    ON CREATE SET n = {fields}
                                    ON MATCH SET n = {fields}`

const generateAddNodeCypher=(params)=>{
    let labels = schema.getParentCategories(params.category)
    if(params.fields&&params.fields.tags)
        labels = [...labels,params.fields.tags]
    labels = _.isArray(labels)?labels.join(":"):params.category;
    return addNodeCypher(labels);
}

const generateDelNodeCypher = (params)=> `
    MATCH (n)
    WHERE n.uuid = {uuid}
    DETACH
    DELETE n
    return n`


const generateDelAllCypher = (params)=>
    `MATCH (n)
    WHERE NOT n:User and NOT n:Role and NOT n:Department
    DETACH
    DELETE n`

const generateQueryNodeCypher = (params) =>
    `MATCH (n:${params.category})
    WHERE n.uuid = {uuid}
    RETURN n`


const findNodesCypher = (label,condition,sort,order) =>
    `MATCH (n:${label}) 
    ${condition}
    RETURN n
    ORDER BY ${sort} ${order}
    `


const findPaginatedNodesCypher = (label,condition,sort,order) =>
    `MATCH (n:${label})
    ${condition}
    WITH
    count(n) AS cnt
    MATCH
    (n:${label})
    ${condition}
    WITH
    n as n, cnt
    ORDER BY ${sort} ${order}
    SKIP {skip} LIMIT {limit}
    RETURN { count: cnt, results:collect(n) }`

/**
 * sequence id generator
 */
const generateSequence=(name)=>
    `MERGE (s:Sequence {name:'${name}'})
    ON CREATE set s.current = 1
    ON MATCH set s.current=s.current+1
    WITH s.current as seq return seq`

/**
 * query item with members
 */
const generateQueryItemWithMembersCypher = (label) => {
    return `MATCH (n:${label} {uuid:{uuid}})
    OPTIONAL MATCH
        (n)<-[:MemberOf]-(m)      
    WITH { self: n, members:collect(distinct m) } as item
    RETURN item`
}

/**
 * query node and relations
 */
const generateQueryNodeWithRelationCypher = (params)=> {
    return `MATCH (n{uuid: {uuid}})
    OPTIONAL MATCH (n)-[]-(c)
    WITH n as self,collect(c) as items
    RETURN self,items`
}

const generateQueryItemByCategoryCypher = (params) => {
    let condition = _.map(params.tags, (tag) => {
        return `n:${tag}`
    }).join(' OR ')
    return `MATCH (n) WHERE (${condition})
    return n
    `
}

const generateQueryInheritHierarchyCypher = `MATCH (base:CategoryLabel{category:{category}})
    MATCH (child)-[:INHERIT]->(base)
    RETURN child`

const generateInheritRelCypher = `MERGE (base:CategoryLabel{category:{category}})
    MERGE (child:CategoryLabel{category:{subtype}})
    MERGE (child)-[:INHERIT]->(base)`


const generateRelationCypher = (params)=>{
    let refProperties = schema.getSchemaRefProperties(params.category),val,cypher,rel_part,rel_cyphers = []
    for(let ref of refProperties){
        val = jp.query(params, `$.${ref.attr}`)[0]
        if(val&&ref.relationship){
            if(ref.relationship.parentObjectAsRelProperty){
                cypher = `MATCH (node:${params.category}{uuid:{uuid}})
                MATCH (ref_node:${ref.schema}{uuid:{${ref.attr.split('.')[0]}}.${ref.attr.split('.')[1]}})
                `
            }else if(ref.type === 'array'&&val.length){
                cypher = `UNWIND {${ref.attr}} as ref_id
                MATCH (node:${params.category} {uuid:{uuid}})
                MATCH (ref_node:${ref.schema}{uuid:ref_id})
                `
            }else{
                cypher = `MATCH (node:${params.category}{uuid:{uuid}})
                MATCH (ref_node:${ref.schema}{uuid:{${ref.attr}}})
                `
            }
            rel_part = `[r:${ref.relationship.name}]`
            if(ref.relationship.reverse)
                cypher = cypher + `MERGE (node)<-${rel_part}-(ref_node)`
            else
                cypher = cypher + `MERGE (node)-${rel_part}->(ref_node)`
            if(ref.relationship.parentObjectAsRelProperty){
                cypher = cypher + ` ON MATCH SET r={${ref.attr.split('.')[0]}}`
            }
            rel_cyphers.push(cypher)
        }
    }
    return rel_cyphers
}


module.exports = {
    generateAddOrUpdateCyphers: (params)=>{
        let cyphers_todo = [generateAddNodeCypher(params),...generateRelationCypher(params)]
        return cyphers_todo
    },
    generateQueryNodesCypher:(params)=>{
        let condition = `where not exists(n.status) or n.status<>'deleted'`,cypher,label=params.category,sort = params.sort?`n.${params.sort}`:`n.lastUpdated`,
            order = params.order?params.order:'DESC'
        if(params.status_filter){
            params.status_filter = params.status_filter.split(",")
            condition = 'where '
            condition += _.map(params.status_filter, (status) => {
                return `n.status='${status}'`
            }).join(' or ')
        }
        if(params.pagination){
            cypher = findPaginatedNodesCypher(label,condition,sort,order)
        }else{
            cypher = findNodesCypher(label,condition,sort,order)
        }
        return cypher;
    },
    generateQueryNodeCypher,
    generateDelNodeCypher,
    generateSequence,
    generateDelAllCypher,
    generateQueryNodeWithRelationCypher,
    generateQueryItemByCategoryCypher,
    generateQueryInheritHierarchyCypher,
    generateQueryItemWithMembersCypher,
    generateInheritRelCypher
}
