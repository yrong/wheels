const config = require('config')
const scirichonCommon = require('scirichon-common')
const check_token = require('scirichon-token-checker')
const acl_checker = require('scirichon-acl-checker')

/**
 * scirichon license
 */
const license_helper = require('license-helper')
const lincense_file = `${process.env['LICENSE_PATH']}/${process.env['NODE_NAME']}.lic`
const license = license_helper.load({path:lincense_file})
logger.info('license:' + JSON.stringify(license))


/**
 * scirichon middlewares
 */
module.exports = (app)=>{
    const redisOption = config.get('redis')
    const auth_url = scirichonCommon.getServiceApiUrl('auth')
    const license_middleware = license_helper.license_middleware
    app.use(license_middleware({path:lincense_file}))
    app.use(check_token({check_token_url:`${auth_url}/auth/check`}))
    app.use(acl_checker({redisOption}))
}

