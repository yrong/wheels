const _ = require('lodash')
const config = require('config')
const schema = require('scirichon-json-schema')
const es_config = config.get('elasticsearch')
const search = require('scirichon-search')
const hooks = require('../hooks')
const requestHandler = require('../hooks/requestHandler')
const batchHandler = require('../hooks/batchHandler')

const schema_checker = (params)=>{
    schema.checkObject((params.data&&params.data.category)||params.category,(params.data&&params.data.fields)||params)
    return params
}

const es_checker=()=>{
    if(es_config.mode === 'strict')
        return search.checkStatus()
    return none_checker()
}

const none_checker = ()=>true

const fields_checker = requestHandler.fieldsChecker

module.exports = (app)=>{
    let routesDef = schema.getApiRouteSchemas(),allowed_methods=['Add', 'Modify', 'Delete','FindOne','FindAll','BatchAdd'],
        preProcess,postProcess,http_method,route,checker,procedure,node_name = process.env['NODE_NAME']

    /*common route*/
    _.each(routesDef,(val)=>{
        if(val.service===node_name){
            _.each(allowed_methods,(method)=>{
                switch (method) {
                    case 'Add':
                        app.defineAPI({
                            method: 'POST',
                            route: '/api'+val.route,
                            check:[fields_checker,schema_checker,es_checker],
                            preProcess: hooks.cudItem_preProcess,
                            postProcess: hooks.cudItem_postProcess
                        })
                        break
                    case 'Modify':
                        app.defineAPI({
                            method: 'PATCH',
                            route: '/api'+val.route+'/:uuid',
                            check:[fields_checker,es_checker],
                            preProcess: hooks.cudItem_preProcess,
                            postProcess: hooks.cudItem_postProcess
                        })
                        break
                    case 'Delete':
                        app.defineAPI({
                            method: 'DEL',
                            route: '/api'+val.route+'/:uuid',
                            check:[es_checker],
                            preProcess: hooks.cudItem_preProcess,
                            postProcess: hooks.cudItem_postProcess
                        })
                    case 'FindOne':
                        app.defineAPI({
                            method: 'GET',
                            route: '/api'+val.route+'/:uuid',
                            preProcess: hooks.queryItems_preProcess,
                            postProcess: hooks.queryItems_postProcess
                        })
                        break
                    case 'FindAll':
                        app.defineAPI({
                            method: 'GET',
                            route: '/api'+val.route,
                            preProcess: hooks.queryItems_preProcess,
                            postProcess: hooks.queryItems_postProcess
                        })
                        break
                    case 'BatchAdd':
                        app.defineAPI({
                            method: 'POST',
                            route: '/api'+val.route + '/batch',
                            procedure:batchHandler.batchAddProcessor
                        })
                        break
                }
            })
        }
    })

    /*search by es*/
    app.defineAPI({
        method: 'POST',
        route: '/api/searchByEql',
        procedure:search.searchItem
    })

    /*search by neo4j*/
    app.defineAPI({
        method: 'POST',
        route: '/api/searchByCypher',
        preProcess: hooks.customizedQueryItems_preProcess,
        postProcess: hooks.queryItems_postProcess
    })


    /*get schema*/
    app.defineAPI({
        method: 'GET',
        route: '/api/schema/:category',
        procedure: hooks.getCategorySchema
    })

    /*get SchemaHierarchy*/
    app.defineAPI({
        method: 'GET',
        route: '/api/schema/hierarchy/:category',
        procedure: hooks.getCategoryInheritanceHierarchy
    })

    /*add SchemaHierarchy*/
    app.defineAPI({
        method: 'POST',
        route: '/api/schema/hierarchy/:category',
        procedure: hooks.addCategoryInheritanceHierarchy
    })


    /* delete all Items(for test purpose) */
    if(process.env.NODE_ENV === 'development'){
        app.defineAPI({
            method: 'DEL',
            route: '/api/items',
            preProcess: hooks.cudItem_preProcess,
            postProcess: hooks.cudItem_postProcess
        })
    }

    /*license*/
    app.router.get('/api/license', function (ctx, next) {
        ctx.body = ctx.state.license
    })

    /*member*/
    app.defineAPI({
        method: 'POST',
        route: '/api/members',
        procedure: hooks.getItemWithMembers
    })

    return app
}
