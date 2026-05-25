const { PermissionsBitField } = require('discord.js');
function userPermissions(permissions) {
    const check = BigInt(permissions);
    const userp = new PermissionsBitField(check);
    //var Permissions = {}
    var t;
    var permissionsList = [];
    var botpermissions = ['Administrator'];
    Object.keys(PermissionsBitField.Flags).forEach(permission => {
        if (userp.has(PermissionsBitField.Flags[permission])) {
            //Permissions = permission;
            permissionsList.push(permission);
        }
    });
    //console.log(permissionsList);
    for (var i in botpermissions) {
        t = 0;
        for (var j in permissionsList) {
            if (botpermissions[i] == permissionsList[j]) {
                t = 1;
                break;
            }
        }
        if (!t) {
            return 0;
        }
    }
    return 1;
}
module.exports = {
    userPermissions
};