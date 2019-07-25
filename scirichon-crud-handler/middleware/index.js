/* eslint camelcase: 0 */
const config = require('config')
const scirichonCommon = require('scirichon-common')
const cors = require('kcors')
const body = require('koa-body')
const responseWrapper = require('scirichon-response-wrapper')
const authenticator = require('scirichon-authenticator')

/**
 * scirichon license
 */
const license_helper = require('license-helper')
const lincense_file = `${process.env['LICENSE_PATH']}/${process.env['NODE_NAME']}.lic`
if (config.get('checkLicense')) {
  const license = license_helper.load({ path: lincense_file })
  console.log('license:' + JSON.stringify(license))
}

/**
 * scirichon middlewares
 */
module.exports = (app) => {
  app.use(cors())
  app.use(body({
    jsonLimit: '10mb',
    formLimit: '10mb',
    textLimit: '10mb',
    parsedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    multipart: true,
    formidable: {
      uploadDir: (process.env['RUNTIME_PATH'] || '../runtime') + '/uploads'
    },
    onerror (error, ctx) {
      ctx.throw(400, `cannot parse request body, ${JSON.stringify(error)}`)
    }
  }))
  app.use(responseWrapper())
  const redisOption = config.get('redis')
  const auth_url = scirichonCommon.getServiceApiUrl('auth')
  const license_middleware = license_helper.license_middleware
  if (config.get('checkLicense')) {
    app.use(license_middleware({ path: lincense_file }))
  }
  app.use(authenticator.checkToken({ check_token_url: `${auth_url}/auth/check` }))
  app.use(authenticator.checkAcl({ redisOption }))
}
