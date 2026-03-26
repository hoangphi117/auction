import db from '../utils/db.js';

export function getAllSettings() {
    return db('system_settings').select('*');
}

export function getSettings() {
    return db('system_settings').first();
}


export function updateSetting(key, value) {
    return db('system_settings')
        .update({ value })
        .where({ key });
}
