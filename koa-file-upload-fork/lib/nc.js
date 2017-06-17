const util = require("./util")
const webdav = require('webdav')
const fs = require('fs')
const rp = require('request-promise')
const _ = require('lodash')

module.exports = (options) => {
    return {
        put: async (filename, file) => {
            await util.fileResolve(file)
            let webdav_admin_path = `/remote.php/dav/files/${options.nc_admin_user}`
            let client = webdav(
                `${options.nc_host}${webdav_admin_path}`,
                options.nc_admin_user,
                options.nc_admin_password
            );
            let buf = fs.readFileSync(file.path)
            let result = await client.putFileContents(`/${options.nc_public_group}/${filename}`,buf,{ format: "binary" })
            console.log(`${filename} uploaded`)
            return result
        },
        get: async (result) => {
            let share_provision_path = '/ocs/v1.php/apps/files_sharing/api/v1/shares',share
                ,auth = "Basic " + new Buffer(options.nc_admin_user + ":" + options.nc_admin_password).toString("base64")
                ,rp_options = {
                    json: true,
                    headers: {Authorization: auth,"OCS-APIREQUEST":true},
                    method: "GET",
                    uri: `${options.nc_host}${share_provision_path}?path=${options.nc_public_group}&format=json`
                }
            share = await rp(rp_options)
            share = _.find(share.ocs.data,(share)=>{
                return share.share_type == 3
            })
            if(!share||!share.url)
                throw new Error('no share link found thus not able to download!')
            let download_path = `${share.url}/download`
            Object.keys(result).map(filename => {
                return result[filename] = encodeURI(`${download_path}?files=${filename}`)
            })
            return result
        }
    }

}