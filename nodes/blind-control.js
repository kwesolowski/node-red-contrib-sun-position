/********************************************
 * blind-control:
 *********************************************/
const path = require('path');

const hlp = require(path.join(__dirname, '/lib/dateTimeHelper.js'));
const util = require('util');

/*************************************************************************************************************************/
/**
 * check if a level has a valid value
 * @param {*} node the node data
 * @param {number} level the level to check
 * @returns {boolean} true if the level is valid, otherwise false
 */
function validPosition_(node, level, allowRound) {
    // node.debug('validPosition_ level='+level);
    if (level === '' || level === null || typeof level === 'undefined') {
        node.warn(`Position is empty!`);
        return false;
    }
    if (isNaN(level)) {
        node.warn(`Position: "${level}" is NaN!`);
        return false;
    }

    if (level < node.blindData.levelBottom) {
        if (node.tempData.levelReverse) {
            node.warn(`Position: "${level}" < open level ${node.blindData.levelBottom}`);
        } else {
            node.warn(`Position: "${level}" < closed level ${node.blindData.levelBottom}`);
        }
        return false;
    }
    if (level > node.blindData.levelTop) {
        if (node.tempData.levelReverse) {
            node.warn(`Position: "${level}" > closed level ${node.blindData.levelTop}`);
        } else {
            node.warn(`Position: "${level}" > open level ${node.blindData.levelTop}`);
        }
        return false;
    }
    if (Number.isInteger(node.blindData.levelTop) &&
        Number.isInteger(node.blindData.levelBottom) &&
        Number.isInteger(node.blindData.increment) &&
        ((level % node.blindData.increment !== 0) ||
        !Number.isInteger(level) )) {
        node.warn(`Position invalid "${level}" not fit to increment ${node.blindData.increment}`);
        return false;
    }
    if (allowRound) {
        return true;
    }
    return Number.isInteger(Number((level / node.blindData.increment).toFixed(hlp.countDecimals(node.blindData.increment) + 2)));
}
/******************************************************************************************/
/**
   * the definition of the time to compare
   * @param {*} compareType type to compare
   * @param {*} msg the message object
   * @param {*} node the current node object
   */
function getNow_(node, msg) {
    let value = '';
    if (typeof msg.time === 'number') {
        value = msg.time;
        node.debug(`compare time to msg.time = "${value}"`);
    } else if (typeof msg.ts === 'number') {
        value = msg.ts;
        node.debug(`compare time to msg.ts = "${value}"`);
    } else {
        return new Date();
    }
    const dto = new Date(value);
    if (hlp.isValidDate(dto)) {
        node.debug(dto.toISOString());
        return dto;
    }
    node.error(`Error can not get a valide timestamp from "${value}"! Will use current timestamp!`);
    return new Date();
}

/******************************************************************************************/
/**
 * get the absolute level from percentage level
 * @param {*} node the node settings
 * @param {*} percentPos the level in percentage (0-1)
 */
function posPrcToAbs_(node, levelPercent) {
    return posRound_(node, ((node.blindData.levelTop - node.blindData.levelBottom) * levelPercent) + node.blindData.levelBottom);
}
/**
 * get the percentage level from absolute level  (0-1)
 * @param {*} node the node settings
 * @param {*} levelAbsolute the level absolute
 * @return {number} get the level percentage
 */
function posAbsToPrc_(node, levelAbsolute) {
    return (levelAbsolute - node.blindData.levelBottom) / (node.blindData.levelTop - node.blindData.levelBottom);
}
/**
 * get the absolute inverse level
 * @param {*} node the node settings
 * @param {*} levelAbsolute the level absolute
 * @return {number} get the inverse level
 */
function getInversePos_(node, level) {
    return posPrcToAbs_(node, 1 - posAbsToPrc_(node, level));
}
/**
 * get the absolute inverse level
 * @param {*} node the node settings
 * @return {number} get the current level
 */
function getRealLevel_(node) {
    if (node.tempData.levelReverse) {
        return node.tempData.levelInverse;
    }
    return node.tempData.level;
}
/**
 * round a level to the next increment
 * @param {*} node node data
 * @param {number} pos level
 * @return {number} rounded level number
 */
function posRound_(node, pos) {
    // node.debug(`levelPrcToAbs_ ${pos} - increment is ${node.blindData.increment}`);
    // pos = Math.ceil(pos / node.blindData.increment) * node.blindData.increment;
    // pos = Math.floor(pos / node.blindData.increment) * node.blindData.increment;
    pos = Math.round(pos / node.blindData.increment) * node.blindData.increment;
    pos = Number(pos.toFixed(hlp.countDecimals(node.blindData.increment)));
    if (pos > node.blindData.levelTop) {
        pos = node.blindData.levelTop;
    }
    if (pos < node.blindData.levelBottom) {
        pos = node.blindData.levelBottom;
    }
    // node.debug(`levelPrcToAbs_ result ${pos}`);
    return pos;
}

/**
 * normalizes an angle
 * @param {number} angle to normalize
 */
function angleNorm_(angle) {
    while (angle < 0) {
        angle += 360;
    }
    while (angle > 360) {
        angle -= 360;
    }
    return angle;
}
/******************************************************************************************/
/**
 * calculates the current sun level
 * @param {*} node node data
 * @param {*} now the current timestamp
 */
function getSunPosition_(node, now) {
    const sunPosition = node.positionConfig.getSunCalc(now, false, false);
    // node.debug('sunPosition: ' + util.inspect(sunPosition, { colors: true, compact: 10, breakLength: Infinity }));
    sunPosition.InWindow = (sunPosition.azimuthDegrees >= node.windowSettings.AzimuthStart) &&
                           (sunPosition.azimuthDegrees <= node.windowSettings.AzimuthEnd);
    node.debug(`sunPosition: InWindow=${sunPosition.InWindow} azimuthDegrees=${sunPosition.azimuthDegrees} AzimuthStart=${node.windowSettings.AzimuthStart} AzimuthEnd=${node.windowSettings.AzimuthEnd}`);
    return sunPosition;
}

module.exports = function (RED) {
    'use strict';
    /**
     * evaluate temporary Data
     * @param {*} node   node Data
     * @param {string} type  type of type input
     * @param {string} value  value of typeinput
     * @param {*} data  data to cache
     * @returns {*}  data which was cached
     */
    function evalTempData(node, type, value, data) {
        // node.debug(`evalTempData type=${type} value=${value} data=${data}`);
        if (data === null || typeof data === 'undefined') {
            const name = `${type}.${value}`;
            if (typeof node.tempData[name] !== 'undefined') {
                node.log(RED._('blind-control.errors.usingTempValue', { type, value, usedValue: node.tempData[name] }));
                return node.tempData[name];
            }
            if (node.nowarn[name]) {
                return null; // only one error per run
            }
            node.warn(RED._('blind-control.errors.warning', { message: RED._('blind-control.errors.notEvaluableProperty', { type, value, usedValue: 'null' }) }));
            node.nowarn[name] = true;
            return null;
        }
        node.tempData[`${type}.${value}`] = data;
        return data;
    }

    /******************************************************************************************/
    /**
     * check the oversteering data
     * @param {*} node node data
     * @param {*} msg the message object
     */
    function checkOversteer(node, msg) {
        // node.debug('checkOversteer');
        try {
            node.oversteer.isChecked = true;
            return node.oversteerData.find(el => node.positionConfig.comparePropValue(node, msg,
                el.valueType,
                el.value,
                el.operator,
                el.thresholdType,
                el.thresholdValue,
                (type, value, data, _id) => { // opCallback
                    return evalTempData(node, type, value, data);
                }));
        } catch (err) {
            node.error(RED._('blind-control.errors.getOversteerData', err));
            node.log(util.inspect(err, Object.getOwnPropertyNames(err)));
        }
        // node.debug('node.oversteerData=' + util.inspect(node.oversteerData, { colors: true, compact: 10, breakLength: Infinity }));
        return undefined;
    }
    /******************************************************************************************/
    /**
     * get the blind level from a typed input
     * @param {*} node node data
     * @param {*} type type field
     * @param {*} value value field
     * @returns blind level as number or NaN if not defined
     */
    function getBlindPosFromTI(node, msg, type, value, def) {
        // node.debug(`getBlindPosFromTI - type=${type} value=${value} def=${def} `);
        def = def || NaN;
        if (type === 'none' || type === '') {
            return def;
        }
        try {
            if (type === 'levelFixed') {
                const val = parseFloat(value);
                if (isNaN(val)) {
                    if (value.includes('close')) {
                        return node.blindData.levelBottom;
                    } else if (value.includes('open')) {
                        return node.blindData.levelTop;
                    } else if (val === '') {
                        return def;
                    }
                } else {
                    if (val < 1) {
                        return node.blindData.levelBottom;
                    } else if (val > 99) {
                        return node.blindData.levelTop;
                    }
                    return (val / 100);
                }
                throw new Error(`unknown value "${value}" of type "${type}"` );
            }
            const res = node.positionConfig.getFloatProp(node, msg, type, value, def);
            if (node.tempData.levelReverse) {
                return getInversePos_(res);
            }
            return res;
        } catch (err) {
            node.error(RED._('blind-control.errors.getBlindPosData', err));
            node.log(util.inspect(err, Object.getOwnPropertyNames(err)));
        }
        return def;
    }
    /******************************************************************************************/
    /**
     * reset any existing override
     * @param {*} node node data
     */
    function blindPosOverwriteReset(node) {
        node.debug(`blindPosOverwriteReset expire=${node.blindData.overwrite.expireTs}`);
        node.blindData.overwrite.active = false;
        node.blindData.overwrite.priority = 0;
        if (node.timeOutObj) {
            clearTimeout(node.timeOutObj);
            node.timeOutObj = null;
        }
        if (node.blindData.overwrite.expireTs || node.blindData.overwrite.expires) {
            delete node.blindData.overwrite.expires;
            delete node.blindData.overwrite.expireTs;
            delete node.blindData.overwrite.expireDate;
            delete node.blindData.overwrite.expireDateISO;
            delete node.blindData.overwrite.expireDateUTC;
            delete node.blindData.overwrite.expireTimeLocal;
            delete node.blindData.overwrite.expireDateLocal;
        }
    }

    /**
     * setup the expiring of n override or update an existing expiring
     * @param {*} node node data
     * @param {Date} now the current timestamp
     * @param {number} expire the expiring time, (if it is NaN, default time will be tried to use) if it is not used, nor a Number or less than 1 no expiring activated
     */
    function setExpiringOverwrite(node, now, expire) {
        node.debug(`setExpiringOverwrite now=${now}, expire=${expire}`);
        if (node.timeOutObj) {
            clearTimeout(node.timeOutObj);
            node.timeOutObj = null;
        }

        if (isNaN(expire)) {
            expire = node.blindData.overwrite.expireDuration;
            node.debug(`using default expire value ${expire}`);
        }
        node.blindData.overwrite.expires = Number.isFinite(expire) && (expire > 0);

        if (!node.blindData.overwrite.expires) {
            node.debug(`expireNever expire=${expire} ${  typeof expire  } - isNaN=${  isNaN(expire)  } - finite=${  !isFinite(expire)  } - min=${  expire < 100}`);
            delete node.blindData.overwrite.expireTs;
            delete node.blindData.overwrite.expireDate;
            return;
        }
        node.blindData.overwrite.expireTs = (now.getTime() + expire);
        node.blindData.overwrite.expireDate = new Date(node.blindData.overwrite.expireTs);
        node.blindData.overwrite.expireDateISO = node.blindData.overwrite.expireDate.toISOString();
        node.blindData.overwrite.expireDateUTC = node.blindData.overwrite.expireDate.toUTCString();
        node.blindData.overwrite.expireDateLocal = node.positionConfig.toDateString(node.blindData.overwrite.expireDate);
        node.blindData.overwrite.expireTimeLocal = node.positionConfig.toTimeString(node.blindData.overwrite.expireDate);

        node.debug(`expires in ${expire}ms = ${node.blindData.overwrite.expireDate}`);
        node.timeOutObj = setTimeout(() => {
            node.debug('timeout - overwrite expired');
            blindPosOverwriteReset(node);
            node.emit('input', { payload: -1, topic: 'internal-trigger-overwriteExpired', force: false });
        }, expire);
    }

    /**
     * check if an override can be reset
     * @param {*} node node data
     * @param {*} msg message object
     * @param {*} now current timestamp
     */
    function checkOverrideReset(node, msg, now, prio) {
        if (node.blindData.overwrite &&
            node.blindData.overwrite.expires &&
            (node.blindData.overwrite.expireTs < now.getTime())) {
            blindPosOverwriteReset(node);
        }
        if ((!prio) || (node.blindData.overwrite.priority <= prio)) {
            hlp.getMsgBoolValue(msg, 'reset', 'resetOverwrite',
                val => {
                    node.debug(`reset val="${util.inspect(val, { colors: true, compact: 10, breakLength: Infinity })  }"`);
                    if (val) {
                        blindPosOverwriteReset(node);
                    }
                });
        }
    }
    /**
     * setting the reason for override
     * @param {*} node node data
     */
    function setOverwriteReason(node) {
        if (node.blindData.overwrite.expireTs) {
            node.reason.code = 3;
            const obj = {
                prio: node.blindData.overwrite.priority,
                timeLocal: node.blindData.overwrite.expireTimeLocal,
                dateLocal: node.blindData.overwrite.expireDateLocal,
                dateISO: node.blindData.overwrite.expireDateISO,
                dateUTC: node.blindData.overwrite.expireDateUTC
            };
            node.reason.state = RED._('blind-control.states.overwriteExpire', obj);
            node.reason.description = RED._('blind-control.reasons.overwriteExpire', obj);
        } else {
            node.reason.code = 2;
            node.reason.state = RED._('blind-control.states.overwriteNoExpire', { prio: node.blindData.overwrite.priority });
            node.reason.description = RED._('blind-control.states.overwriteNoExpire', { prio: node.blindData.overwrite.priority });
        }
        node.debug(`overwrite exit true node.blindData.overwrite.active=${node.blindData.overwrite.active}`);
    }

    /**
     * check if a manual overwrite of the blind level should be set
     * @param {*} node node data
     * @param {*} msg message object
     * @returns true if override is active, otherwise false
     */
    function checkBlindPosOverwrite(node, msg, now) {
        node.debug(`checkBlindPosOverwrite act=${node.blindData.overwrite.active} `);
        const prio = hlp.getMsgNumberValue(msg, ['prio', 'priority'], ['prio', 'alarm'], p => {
            checkOverrideReset(node, msg, now, p);
            return p;
        }, () => {
            checkOverrideReset(node, msg, now);
            return 0;
        });
        if (node.blindData.overwrite.active && (node.blindData.overwrite.priority > 0) && (node.blindData.overwrite.priority > prio)) {
            setOverwriteReason(node);
            node.debug(`overwrite exit true node.blindData.overwrite.active=${node.blindData.overwrite.active}, prio=${prio}, node.blindData.overwrite.priority=${node.blindData.overwrite.priority}`);
            // if active, the prio must be 0 or given with same or higher as current overwrite otherwise this will not work
            return true;
        }
        const onlyTrigger = hlp.getMsgBoolValue(msg, ['trigger', 'noOverwrite'], ['triggerOnly', 'noOverwrite']);
        let newPos = hlp.getMsgNumberValue(msg, ['blindPosition', 'position', 'level', 'blindLevel'], ['manual', 'levelOverwrite']);
        const expire = hlp.getMsgNumberValue(msg, 'expire', 'expire');
        if (!onlyTrigger && node.blindData.overwrite.active && isNaN(newPos)) {
            node.debug(`overwrite active, check of prio=${prio} or expire=${expire}, newPos=${newPos}`);
            if (Number.isFinite(expire)) {
                // set to new expiring time
                setExpiringOverwrite(node, now, expire);
            }
            if (prio > 0) {
                // set to new priority
                node.blindData.overwrite.priority = prio;
            }
            setOverwriteReason(node);
            node.debug(`overwrite exit true node.blindData.overwrite.active=${node.blindData.overwrite.active}, newPos=${newPos}, expire=${expire}`);
            return true;
        } else if (!onlyTrigger && !isNaN(newPos)) {
            node.debug(`needOverwrite prio=${prio} expire=${expire} newPos=${newPos}`);
            if (newPos === -1) {
                node.tempData.level = NaN;
                node.tempData.levelInverse = NaN;
            } else if (!isNaN(newPos)) {
                const allowRound = (msg.topic ? (msg.topic.includes('roundLevel') || msg.topic.includes('roundLevel')) : false);
                if (!validPosition_(node, newPos, allowRound)) {
                    node.error(RED._('blind-control.errors.invalid-blind-level', { pos: newPos }));
                    return false;
                }
                if (allowRound) {
                    newPos = posRound_(node, newPos);
                }
                node.debug(`overwrite newPos=${newPos}`);
                const noSameValue = hlp.getMsgBoolValue(msg, 'ignoreSameValue');
                if (noSameValue && (node.previousData.level === newPos)) {
                    setOverwriteReason(node);
                    node.debug(`overwrite exit true noSameValue=${noSameValue}, newPos=${newPos}`);
                    return true;
                }
                node.tempData.level = newPos;
                node.tempData.levelInverse = newPos;
            }

            if (Number.isFinite(expire) || (prio <= 0)) {
                // will set expiring if prio is 0 or if expire is explizit defined
                setExpiringOverwrite(node, now, expire);
            } else if ((prio > node.blindData.overwrite.priority) || (!node.blindData.overwrite.expireTs)) {
                // no expiring on prio change or no existing expiring
                setExpiringOverwrite(node, now, -1);
            }
            if (prio > 0) {
                node.blindData.overwrite.priority = prio;
            }
            node.blindData.overwrite.active = true;
        }
        if (node.blindData.overwrite.active) {
            setOverwriteReason(node);
            node.debug(`overwrite exit true node.blindData.overwrite.active=${node.blindData.overwrite.active}`);
            return true;
        }
        node.debug(`overwrite exit false node.blindData.overwrite.active=${node.blindData.overwrite.active}`);
        return false;
    }

    /******************************************************************************************/
    /**
     * calculates for the blind the new level
     * @param {*} node the node data
     * @param {*} msg the message object
     * @returns the sun position object
     */
    function calcBlindSunPosition(node, msg, now) {
        node.debug('calcBlindSunPosition: calculate blind position by sun');
        // sun control is active
        const sunPosition = getSunPosition_(node, now);
        const winterMode = 1;
        const summerMode = 2;

        if (!sunPosition.InWindow) {
            if (node.sunData.mode === winterMode) {
                node.tempData.level = node.blindData.levelMin;
                node.tempData.levelInverse = getInversePos_(node, node.tempData.level);
                node.reason.code = 13;
                node.reason.state = RED._('blind-control.states.sunNotInWinMin');
                node.reason.description = RED._('blind-control.reasons.sunNotInWin');
            } else {
                node.reason.code = 8;
                node.reason.state = RED._('blind-control.states.sunNotInWin');
                node.reason.description = RED._('blind-control.reasons.sunNotInWin');
            }
            return sunPosition;
        }

        if ((node.sunData.mode === summerMode) && node.sunData.minAltitude && (sunPosition.altitudeDegrees < node.sunData.minAltitude)) {
            node.reason.code = 7;
            node.reason.state = RED._('blind-control.states.sunMinAltitude');
            node.reason.description = RED._('blind-control.reasons.sunMinAltitude');
            return sunPosition;
        }

        if (node.oversteer.active) {
            const res = checkOversteer(node, msg);
            if (res) {
                node.tempData.level = res.blindPos;
                node.tempData.levelInverse = getInversePos_(node, node.tempData.level);
                node.reason.code = 10;
                node.reason.state = RED._('blind-control.states.oversteer');
                node.reason.description = RED._('blind-control.reasons.oversteer');
                sunPosition.oversteer = res;
                sunPosition.oversteerAll = node.oversteerData;
                return sunPosition;
            }
            sunPosition.oversteerAll = node.oversteerData;
        }

        if (node.sunData.mode === winterMode) {
            node.tempData.level = node.blindData.levelMax;
            node.tempData.levelInverse = getInversePos_(node, node.tempData.level);
            node.reason.code = 12;
            node.reason.state = RED._('blind-control.states.sunInWinMax');
            node.reason.description = RED._('blind-control.reasons.sunInWinMax');
            return sunPosition;
        }

        // node.debug('node.windowSettings: ' + util.inspect(node.windowSettings, { colors: true, compact: 10 }));
        const height = Math.tan(sunPosition.altitudeRadians) * node.sunData.floorLength;
        // node.debug(`height=${height} - altitude=${sunPosition.altitudeRadians} - floorLength=${node.sunData.floorLength}`);
        if (height <= node.windowSettings.bottom) {
            node.tempData.level = node.blindData.levelBottom;
            node.tempData.levelInverse = node.blindData.levelTop;
        } else if (height >= node.windowSettings.top) {
            node.tempData.level = node.blindData.levelTop;
            node.tempData.levelInverse = node.blindData.levelBottom;
        } else {
            node.tempData.level = posPrcToAbs_(node, (height - node.windowSettings.bottom) / (node.windowSettings.top - node.windowSettings.bottom));
            node.tempData.levelInverse = getInversePos_(node, node.tempData.level);
        }

        const delta = Math.abs(node.previousData.level - node.tempData.level);

        if ((node.smoothTime > 0) && (node.sunData.changeAgain > now.getTime())) {
            node.debug(`no change smooth - smoothTime= ${node.smoothTime}  changeAgain= ${node.sunData.changeAgain}`);
            node.reason.code = 11;
            node.reason.state = RED._('blind-control.states.smooth', { pos: getRealLevel_(node).toString()});
            node.reason.description = RED._('blind-control.reasons.smooth', { pos: getRealLevel_(node).toString()});
            node.tempData.level = node.previousData.level;
            node.tempData.levelInverse = node.previousData.levelInverse;
        } else if ((node.sunData.minDelta > 0) && (delta < node.sunData.minDelta) && (node.tempData.level > node.blindData.levelBottom) && (node.tempData.level < node.blindData.levelTop)) {
            node.reason.code = 14;
            node.reason.state = RED._('blind-control.states.sunMinDelta', { pos: getRealLevel_(node).toString()});
            node.reason.description = RED._('blind-control.reasons.sunMinDelta', { pos: getRealLevel_(node).toString() });
            node.tempData.level = node.previousData.level;
            node.tempData.levelInverse = node.previousData.levelInverse;
        } else {
            node.reason.code = 9;
            node.reason.state = RED._('blind-control.states.sunCtrl');
            node.reason.description = RED._('blind-control.reasons.sunCtrl');
            node.sunData.changeAgain = now.getTime() + node.smoothTime;
            // node.debug(`set next time - smoothTime= ${node.smoothTime}  changeAgain= ${node.sunData.changeAgain} now=` + now.getTime());
        }
        if (node.tempData.level < node.blindData.levelMin)  {
            // min
            node.debug(`${node.tempData.level} is below ${node.blindData.levelMin} (min)`);
            node.reason.code = 5;
            node.reason.state = RED._('blind-control.states.sunCtrlMin', {org: node.reason.state});
            node.reason.description = RED._('blind-control.reasons.sunCtrlMin', {org: node.reason.description, level:node.tempData.level});
            node.tempData.level = node.blindData.levelMin;
            node.tempData.levelInverse = getInversePos_(node, node.tempData.level); // node.blindData.levelMax;
        } else if (node.tempData.level > node.blindData.levelMax) {
            // max
            node.debug(`${node.tempData.level} is above ${node.blindData.levelMax} (max)`);
            node.reason.code = 6;
            node.reason.state = RED._('blind-control.states.sunCtrlMax', {org: node.reason.state});
            node.reason.description = RED._('blind-control.reasons.sunCtrlMax', {org: node.reason.description, level:node.tempData.level});
            node.tempData.level = node.blindData.levelMax;
            node.tempData.levelInverse = getInversePos_(node, node.tempData.level); // node.blindData.levelMin;
        }
        node.debug(`calcBlindSunPosition end pos=${node.tempData.level} reason=${node.reason.code} description=${node.reason.description}`);
        return sunPosition;
    }
    /******************************************************************************************/
    /**
     * pre-checking conditions to may be able to store temp data
     * @param {*} node node data
     * @param {*} msg the message object
     */
    function prepareRules(node, msg) {
        for (let i = 0; i < node.rules.count; ++i) {
            const rule = node.rules.data[i];
            if (rule.conditional) {
                delete rule.conditonData.operandValue;
                delete rule.conditonData.thresholdValue;
                rule.conditonData.result = node.positionConfig.comparePropValue(node, msg,
                    rule.validOperandAType,
                    rule.validOperandAValue,
                    rule.validOperator,
                    rule.validOperandBType,
                    rule.validOperandBValue,
                    (type, value, data, _id) => { // opCallback
                        if (_id === 1) {
                            rule.conditonData.operandValue = value;
                        } else if (_id === 2) {
                            rule.conditonData.thresholdValue = value;
                        }
                        return evalTempData(node, type, value, data);
                    });
                rule.conditonData.text = rule.conditonData.operandName + ' ' + rule.conditonData.operatorText;
                rule.conditonData.textShort = (rule.conditonData.operandNameShort || rule.conditonData.operandName) + ' ' + rule.conditonData.operatorText;
                if (typeof rule.conditonData.thresholdValue !== 'undefined') {
                    rule.conditonData.text += ' ' + rule.conditonData.thresholdValue;
                    rule.conditonData.textShort += ' ' + hlp.clipStrLength(rule.conditonData.thresholdValue, 10);
                }
            }
        }
    }

    /**
       * calculates the times
       * @param {*} node node data
       * @param {*} msg the message object
       * @param {*} config the configuration object
       * @returns the active rule or null
       */
    function checkRules(node, msg, now) {
        const livingRuleData = {};
        const nowNr = now.getTime();
        prepareRules(node,msg);
        node.debug(`checkRules nowNr=${nowNr}, rules.count=${node.rules.count}, rules.lastUntil=${node.rules.lastUntil}`); // {colors:true, compact:10}

        const fkt = (rule, cmp) => {
            // node.debug('rule ' + util.inspect(rule, {colors:true, compact:10}));
            if (rule.conditional) {
                try {
                    if (!rule.conditonData.result) {
                        return null;
                    }
                } catch (err) {
                    node.warn(RED._('blind-control.errors.getPropertyData', err));
                    node.debug(util.inspect(err, Object.getOwnPropertyNames(err)));
                    return null;
                }
            }
            if (!rule.timeLimited) {
                return rule;
            }
            rule.timeData = node.positionConfig.getTimeProp(node, msg, {
                type: rule.timeType,
                value : rule.timeValue,
                offsetType : rule.offsetType,
                offset : rule.offsetValue,
                multiplier : rule.multiplier,
                next : false,
                now
            });

            if (rule.timeData.error) {
                hlp.handleError(node, RED._('blind-control.errors.error-time', { message: rule.timeData.error }), undefined, rule.timeData.error);
                return null;
            } else if (!rule.timeData.value) {
                throw new Error('Error can not calc time!');
            }
            rule.timeData.num = rule.timeData.value.getTime();
            // node.debug(`pos=${rule.pos} type=${rule.timeOpText} - ${rule.timeValue} - rule.timeData = ${ util.inspect(rule.timeData, { colors: true, compact: 40, breakLength: Infinity }) }`);
            if (cmp(rule.timeData.num)) {
                return rule;
            }
            return null;
        };

        let ruleSel = null;
        let ruleSelMin = null;
        let ruleSelMax = null;
        // node.debug('first loop ' + node.rules.count);
        for (let i = 0; i <= node.rules.lastUntil; ++i) {
            const rule = node.rules.data[i];
            // node.debug('rule ' + rule.timeOp + ' - ' + (rule.timeOp !== 1) + ' - ' + util.inspect(rule, {colors:true, compact:10, breakLength: Infinity }));
            if (rule.timeOp === 1) { continue; } // - Until: timeOp === 0
            const res = fkt(rule, r => (r >= nowNr));
            if (res) {
                node.debug('1. ruleSel ' + util.inspect(res, { colors: true, compact: 10, breakLength: Infinity }));
                if (res.levelOp === 1) {
                    ruleSelMin = res;
                } else if (res.levelOp === 2) {
                    ruleSelMax = res;
                } else if (res.levelOp === 3) {
                    ruleSelMin = null;
                } else if (res.levelOp === 4) {
                    ruleSelMax = null;
                } else {
                    ruleSel = res;
                    break;
                }
            }
        }
        if (!ruleSel) {
            // node.debug('--------- starting second loop ' + node.rules.count);
            for (let i = (node.rules.count - 1); i >= 0; --i) {
                const rule = node.rules.data[i];
                // node.debug('rule ' + rule.timeOp + ' - ' + (rule.timeOp !== 0) + ' - ' + util.inspect(rule, {colors:true, compact:10, breakLength: Infinity }));
                if (rule.timeOp === 0) { continue; } // - From: timeOp === 1
                const res = fkt(rule, r => (r <= nowNr));
                if (res) {
                    node.debug('2. ruleSel ' + util.inspect(res, { colors: true, compact: 10, breakLength: Infinity }));
                    if (res.levelOp === 1) {
                        ruleSelMin = res;
                    } else if (res.levelOp === 2) {
                        ruleSelMax = res;
                    } else if (res.levelOp === 3) {
                        ruleSelMin = null;
                    } else if (res.levelOp === 4) {
                        ruleSelMax = null;
                    } else {
                        ruleSel = res;
                        break;
                    }
                }
            }
        }
        if (ruleSelMin) {
            node.debug('ruleSelMin ' + util.inspect(ruleSelMin, { colors: true, compact: 10, breakLength: Infinity }));
            livingRuleData.hasMinimum = true;
            livingRuleData.levelMinimum = getBlindPosFromTI(node, msg, ruleSelMin.levelType, ruleSelMin.levelValue, node.blindData.levelDefault);
            livingRuleData.minimum = {
                id: ruleSelMin.pos,
                conditional: ruleSelMin.conditional,
                timeLimited: ruleSelMin.timeLimited,
                conditon: ruleSelMin.conditonData,
                time: ruleSelMin.timeData
            };
        } else {
            livingRuleData.hasMinimum = false;
        }
        if (ruleSelMax) {
            node.debug('ruleSelMax ' + util.inspect(ruleSelMax, { colors: true, compact: 10, breakLength: Infinity }));
            livingRuleData.hasMaximum = true;
            livingRuleData.levelMaximum = getBlindPosFromTI(node, msg, ruleSelMax.levelType, ruleSelMax.levelValue, node.blindData.levelDefault);
            livingRuleData.maximum = {
                id: ruleSelMax.pos,
                conditional: ruleSelMax.conditional,
                timeLimited: ruleSelMax.timeLimited,
                conditon: ruleSelMax.conditonData,
                time: ruleSelMax.timeData
            };
        } else {
            livingRuleData.hasMaximum = false;
        }
        if (ruleSel) {
            // ruleSel.text = '';
            node.debug('ruleSel ' + util.inspect(ruleSel, {colors:true, compact:10, breakLength: Infinity }));
            node.reason.code = 4;
            livingRuleData.id = ruleSel.pos;
            node.reason.code = 4;

            if (ruleSel.levelOp === 0) { // absolute rule
                livingRuleData.active = true;
                livingRuleData.level = getBlindPosFromTI(node, msg, ruleSel.levelType, ruleSel.levelValue, node.blindData.levelDefault);
            } else {
                livingRuleData.active = false;
                livingRuleData.level = node.blindData.levelDefault;
            }

            livingRuleData.conditional = ruleSel.conditional;
            livingRuleData.timeLimited = ruleSel.timeLimited;
            node.tempData.level = livingRuleData.level;
            node.tempData.levelInverse = getInversePos_(node, livingRuleData.level);
            const data = { number: ruleSel.pos };
            let name = 'rule';
            if (ruleSel.conditional) {
                livingRuleData.conditon = ruleSel.conditonData;
                data.text = ruleSel.conditonData.text;
                data.textShort = ruleSel.conditonData.textShort;
                data.operatorText = ruleSel.conditonData.operatorText;
                data.operatorDescription = ruleSel.conditonData.operatorDescription;
                name = 'ruleCond';
            }
            if (ruleSel.timeLimited) {
                livingRuleData.time = ruleSel.timeData;
                livingRuleData.time.timeLocal = node.positionConfig.toTimeString(ruleSel.timeData.value);
                livingRuleData.time.timeLocalDate = node.positionConfig.toDateString(ruleSel.timeData.value);
                livingRuleData.time.dateISO= ruleSel.timeData.value.toISOString();
                livingRuleData.time.dateUTC= ruleSel.timeData.value.toUTCString();
                data.timeOp = ruleSel.timeOpText;
                data.timeLocal = livingRuleData.time.timeLocal;
                data.time = livingRuleData.time.dateISO;
                name = (ruleSel.conditional) ? 'ruleTimeCond' : 'ruleTime';
            }
            node.reason.state= RED._('blind-control.states.'+name, data);
            node.reason.description = RED._('blind-control.reasons.'+name, data);
            node.debug(`checkRules end pos=${node.tempData.level} reason=${node.reason.code} description=${node.reason.description} all=${util.inspect(livingRuleData, { colors: true, compact: 10, breakLength: Infinity })}`);
            return livingRuleData;
        }
        livingRuleData.active = false;
        livingRuleData.id = -1;
        node.tempData.level = node.blindData.levelDefault;
        node.tempData.levelInverse = getInversePos_(node, node.blindData.levelDefault);
        node.reason.code = 1;
        node.reason.state = RED._('blind-control.states.default');
        node.reason.description = RED._('blind-control.reasons.default');
        node.debug(`checkRules end pos=${node.tempData.level} reason=${node.reason.code} description=${node.reason.description} all=${util.inspect(livingRuleData, { colors: true, compact: 10, breakLength: Infinity })}`);
        return livingRuleData;
    }
    /******************************************************************************************/
    /******************************************************************************************/
    /**
     * standard Node-Red Node handler for the sunBlindControlNode
     * @param {*} config the Node-Red Configuration property of the Node
     */
    function sunBlindControlNode(config) {
        RED.nodes.createNode(this, config);
        this.positionConfig = RED.nodes.getNode(config.positionConfig);
        this.outputs = Number(config.outputs || 1);
        this.smoothTime = (parseFloat(config.smoothTime) || 0);
        const node = this;

        if (node.smoothTime >= 0x7FFFFFFF) {
            node.error(RED._('blind-control.errors.smoothTimeToolong', this));
            delete node.smoothTime;
        }
        node.nowarn = {};
        node.reason = {
            code : 0,
            state: '',
            description: ''
        };
        // temporary node Data
        node.tempData = {
            level: NaN, // unknown
            levelInverse: NaN,
            levelReverse: false
        };
        // Retrieve the config node
        node.sunData = {
            /** Defines if the sun control is active or not */
            active: false,
            mode: Number(hlp.chkValueFilled(config.sunControlMode, 0)),
            /** define how long could be the sun on the floor **/
            floorLength: Number(hlp.chkValueFilled(config.sunFloorLength,0)),
            /** minimum altitude of the sun */
            minAltitude: Number(hlp.chkValueFilled(config.sunMinAltitude, 0)),
            minDelta: Number(hlp.chkValueFilled(config.sunMinDelta, 0)),
            changeAgain: 0
        };
        node.sunData.active = node.sunData.mode > 0;
        node.sunData.modeMax = node.sunData.mode;
        node.windowSettings = {
            /** The top of the window */
            top: Number(config.windowTop),
            /** The bottom of the window */
            bottom: Number(config.windowBottom),
            /** the orientation angle to the geographical north */
            AzimuthStart: angleNorm_(Number(hlp.chkValueFilled(config.windowAzimuthStart, 0))),
            /** an offset for the angle clockwise offset */
            AzimuthEnd: angleNorm_(Number(hlp.chkValueFilled(config.windowAzimuthEnd, 0)))
        };
        node.blindData = {
            /** The Level of the window */
            levelTop: Number(hlp.chkValueFilled(config.blindOpenPos, 100)),
            levelBottom: Number(hlp.chkValueFilled(config.blindClosedPos, 0)),
            increment: Number(hlp.chkValueFilled(config.blindIncrement, 1)),
            levelDefault: NaN,
            levelMin: NaN,
            levelMax: NaN,
            /** The override settings */
            overwrite: {
                active: false,
                expireDuration: parseFloat(hlp.chkValueFilled(config.overwriteExpire, NaN)),
                priority: 0
            }
        };

        if (node.blindData.levelTop < node.blindData.levelBottom) {
            [node.blindData.levelBottom, node.blindData.levelTop] = [node.blindData.levelTop, node.blindData.levelBottom];
            node.tempData.levelReverse = true;
        }

        node.blindData.levelDefault = getBlindPosFromTI(node, undefined, config.blindPosDefaultType, config.blindPosDefault, node.blindData.levelTop);
        node.blindData.levelMin = getBlindPosFromTI(node, undefined, config.blindPosMinType, config.blindPosMin, node.blindData.levelBottom);
        node.blindData.levelMax = getBlindPosFromTI(node, undefined, config.blindPosMaxType, config.blindPosMax, node.blindData.levelTop);
        node.oversteer = {
            active: (typeof config.oversteerValueType !== 'undefined') && (config.oversteerValueType !== 'none'),
            isChecked: false
        };
        node.oversteerData = [];
        if (node.oversteer.active) {
            node.oversteerData.push({
                value: config.oversteerValue || '',
                valueType: config.oversteerValueType || 'none',
                operator: config.oversteerCompare,
                thresholdValue: config.oversteerThreshold || '',
                thresholdType: config.oversteerThresholdType,
                blindPos: getBlindPosFromTI(node, undefined, config.oversteerBlindPosType, config.oversteerBlindPos, node.blindData.levelTop)
            });
            if ((typeof config.oversteer2ValueType !== 'undefined') && (config.oversteer2ValueType !== 'none')) {
                node.oversteerData.push({
                    value: config.oversteer2Value || '',
                    valueType: config.oversteer2ValueType || 'none',
                    operator: config.oversteer2Compare,
                    thresholdValue: config.oversteer2Threshold || '',
                    thresholdType: config.oversteer2ThresholdType,
                    blindPos: getBlindPosFromTI(node, undefined, config.oversteer2BlindPosType, config.oversteer2BlindPos, node.blindData.levelTop)
                });
            }
            if ((typeof config.oversteer3ValueType !== 'undefined') && (config.oversteer3ValueType !== 'none')) {
                node.oversteerData.push({
                    value: config.oversteer3Value || '',
                    valueType: config.oversteer3ValueType || 'none',
                    operator: config.oversteer3Compare,
                    thresholdValue: config.oversteer3Threshold || '',
                    thresholdType: config.oversteer3ThresholdType,
                    blindPos: getBlindPosFromTI(node, undefined, config.oversteer3BlindPosType, config.oversteer3BlindPos, node.blindData.levelTop)
                });
            }
        }

        node.rules = {
            data: config.rules || []
        };
        node.previousData = {
            level: NaN,
            reasonCode: -1,
            usedRule: NaN
        };

        /**
         * set the state of the node
         */
        function setState(blindCtrl) {
            let code = node.reason.code;
            let shape = 'ring';
            let fill = 'yellow';
            if (code === 10) { // smooth;
                code = node.previousData.reasonCode;
            }

            if (node.tempData.level === node.blindData.levelTop) {
                shape = 'dot';
            }

            if (code <= 3) {
                fill = 'blue'; // override
            } else if (code === 4 || code === 15 || code === 16) {
                fill = 'grey'; // rule
            } else if (code === 1 || code === 8) {
                fill = 'green'; // not in window or oversteerExceeded
            }

            node.reason.stateComplete = (isNaN(blindCtrl.level)) ? node.reason.state : getRealLevel_(node).toString() + ' - ' + node.reason.state;
            node.status({
                fill,
                shape,
                text: node.reason.stateComplete
            });
        }

        node.done = (text, msg) => {
            if (text) {
                return this.error(text, msg);
            }
            return null;
        };
        /**
         * handles the input of a message object to the node
         */
        this.on('input', function (msg, send, done) {
            // If this is pre-1.0, 'send' will be undefined, so fallback to node.send
            send = send || function() { node.send.apply(node, arguments) };
            done = done || this.done;
            try {
                node.debug(`input msg.topic=${msg.topic} msg.payload=${msg.payload}`);
                // node.debug('input ' + util.inspect(msg, { colors: true, compact: 10, breakLength: Infinity })); // Object.getOwnPropertyNames(msg)
                if (!this.positionConfig) {
                    // node.error(RED._('node-red-contrib-sun-position/position-config:errors.pos-config'));
                    node.status({
                        fill: 'red',
                        shape: 'dot',
                        text: 'Node not properly configured!!'
                    });
                    done(RED._('node-red-contrib-sun-position/position-config:errors.pos-config'), msg);
                    return null;
                }
                node.nowarn = {};
                const blindCtrl = {
                    reason : node.reason,
                    blind: node.blindData
                };

                node.previousData.level = node.tempData.level;
                node.previousData.levelInverse = node.tempData.levelInverse;
                node.previousData.reasonCode= node.reason.code;
                node.previousData.reasonState= node.reason.state;
                node.previousData.reasonDescription= node.reason.description;
                node.oversteer.isChecked = false;
                node.reason.code = NaN;
                const now = getNow_(node, msg);
                // check if the message contains any oversteering data
                let ruleId = -1; // NaN;

                const newMode = hlp.getMsgNumberValue(msg, ['mode'], ['setMode']);
                if (Number.isFinite(newMode) && newMode >= 0 && newMode <= node.sunData.modeMax) {
                    node.sunData.mode = newMode;
                }

                // node.debug(`start pos=${node.tempData.level} manual=${node.blindData.overwrite.active} reasoncode=${node.reason.code} description=${node.reason.description}`);
                // check for manual overwrite
                if (!checkBlindPosOverwrite(node, msg, now)) {
                    // calc times:
                    blindCtrl.rule = checkRules(node, msg, now);
                    ruleId = blindCtrl.rule.id;
                    if (!blindCtrl.rule.active && node.sunData.active) {
                        // calc sun position:
                        blindCtrl.sunPosition = calcBlindSunPosition(node, msg, now);
                    }
                    if (blindCtrl.rule.hasMinimum && (node.tempData.level < blindCtrl.rule.levelMinimum)) {
                        node.debug(`${node.tempData.level} is below rule minimum ${blindCtrl.rule.levelMinimum}`);
                        node.reason.code = 15;
                        node.reason.state = RED._('blind-control.states.ruleMin', { org: node.reason.state, number: blindCtrl.rule.minimum.id });
                        node.reason.description = RED._('blind-control.reasons.ruleMin', { org: node.reason.description, level: getRealLevel_(node), number: blindCtrl.rule.minimum.id });
                        node.tempData.level = blindCtrl.rule.levelMinimum;
                        node.tempData.levelInverse = getInversePos_(node, node.tempData.level);
                    } else if (blindCtrl.rule.hasMaximum && (node.tempData.level > blindCtrl.rule.levelMaximum)) {
                        node.debug(`${node.tempData.level} is above rule maximum ${blindCtrl.rule.levelMaximum}`);
                        node.reason.code = 26;
                        node.reason.state = RED._('blind-control.states.ruleMax', { org: node.reason.state, number: blindCtrl.rule.maximum.id });
                        node.reason.description = RED._('blind-control.reasons.ruleMax', { org: node.reason.description, level: getRealLevel_(node), number: blindCtrl.rule.maximum.id });
                        node.tempData.level = blindCtrl.rule.levelMaximum;
                        node.tempData.levelInverse = getInversePos_(node, node.tempData.level);
                    }
                    if (node.tempData.level < node.blindData.levelBottom) {
                        node.debug(`${node.tempData.level} is below ${node.blindData.levelBottom}`);
                        node.tempData.level = node.blindData.levelBottom;
                        node.tempData.levelInverse = node.blindData.levelTop;
                    }
                    if (node.tempData.level > node.blindData.levelTop) {
                        node.debug(`${node.tempData.level} is above ${node.blindData.levelBottom}`);
                        node.tempData.level = node.blindData.levelTop;
                        node.tempData.levelInverse = node.blindData.levelBottom;
                    }
                }

                if (node.oversteer.active && !node.oversteer.isChecked) {
                    node.oversteerData.forEach(el => {
                        node.positionConfig.getPropValue(node, msg, {
                            type: el.valueType,
                            value: el.value,
                            callback: (type, value, data, _ip) => {
                                if (data !== null && typeof data !== 'undefined') {
                                    node.tempData[type + '.' + value] = data;
                                }
                            },
                            operator: el.operator
                        });
                    });
                }

                if (node.tempData.levelReverse) {
                    blindCtrl.level = node.tempData.levelInverse;
                    blindCtrl.levelInverse = node.tempData.level;
                } else {
                    blindCtrl.level = node.tempData.level;
                    blindCtrl.levelInverse = node.tempData.levelInverse;
                }
                node.debug(`result pos=${blindCtrl.level} manual=${node.blindData.overwrite.active} reasoncode=${node.reason.code} description=${node.reason.description}`);
                setState(blindCtrl);

                let topic = config.topic;
                if (topic) {
                    const topicAttrs = {
                        name: node.name,
                        level: blindCtrl.level,
                        levelInverse: blindCtrl.levelInverse,
                        code: node.reason.code,
                        state: node.reason.state,
                        rule: ruleId,
                        mode: node.sunData.mode,
                        topic: msg.topic,
                        payload: msg.payload
                    };
                    topic = hlp.topicReplace(config.topic, topicAttrs);
                }

                if ((!isNaN(node.tempData.level)) &&
                    ((node.tempData.level !== node.previousData.level) ||
                    (node.reason.code !== node.previousData.reasonCode) ||
                    (ruleId !== node.previousData.usedRule))) {
                    msg.payload = blindCtrl.level;
                    if (node.outputs > 1) {
                        send([msg, { topic, payload: blindCtrl}]); // node.send([msg, { topic, payload: blindCtrl}]);
                    } else {
                        msg.topic = topic || msg.topic;
                        msg.blindCtrl = blindCtrl;
                        send(msg, null); // node.send(msg, null);
                    }
                } else if (node.outputs > 1) {
                    send([null, { topic, payload: blindCtrl}]); // node.send([null, { topic, payload: blindCtrl}]);
                }
                node.previousData.usedRule = ruleId;
                done();
                return null;
            } catch (err) {
                // node.error(RED._('blind-control.errors.error', err));
                node.log(util.inspect(err, Object.getOwnPropertyNames(err)));
                node.status({
                    fill: 'red',
                    shape: 'ring',
                    text: 'internal error'
                });
                done(RED._('blind-control.errors.error', err), msg);
            }
            return null;
        });
        // ####################################################################################################
        /**
         * initializes the node
         */
        function initialize() {
            node.debug('initialize');
            const getName = (type, value) => {
                if (type === 'num') {
                    return value;
                } else if (type === 'str') {
                    return '"' + value + '"';
                } else if (type === 'bool') {
                    return '"' + value + '"';
                } else if (type === 'global' || type === 'flow') {
                    value = value.replace(/^#:(.+)::/, '');
                }
                return type + '.' + value;
            };
            const getNameShort = (type, value) => {
                if (type === 'num') {
                    return value;
                } else if (type === 'str') {
                    return '"' + hlp.clipStrLength(value,20) + '"';
                } else if (type === 'bool') {
                    return '"' + value + '"';
                } else if (type === 'global' || type === 'flow') {
                    value = value.replace(/^#:(.+)::/, '');
                    // special for Homematic Devices
                    if (/^.+\[('|").{18,}('|")\].*$/.test(value)) {
                        value = value.replace(/^.+\[('|")/, '').replace(/('|")\].*$/, '');
                        if (value.length > 25) {
                            return '...' + value.slice(-22);
                        }
                        return value;
                    }
                }
                if ((type + value).length > 25) {
                    return type + '...' + value.slice(-22);
                }
                return type + '.' + value;
            };
            node.rules.count = node.rules.data.length;
            node.rules.lastUntil = node.rules.count -1;
            node.rules.checkUntil = false;
            node.rules.checkFrom = false;
            node.rules.firstFrom = node.rules.lastUntil;

            for (let i = 0; i < node.rules.count; ++i) {
                const rule = node.rules.data[i];
                rule.pos = i + 1;
                rule.timeOp = Number(rule.timeOp) || 0;
                rule.levelOp = Number(rule.levelOp) || 0;
                rule.conditional = (rule.validOperandAType !== 'none');
                rule.timeLimited = (rule.timeType !== 'none');
                if (!rule.timeLimited) {
                    rule.timeOp = -1;
                }
                if (rule.conditional) {
                    rule.conditonData = {
                        result: false,
                        operandName: getName(rule.validOperandAType,rule.validOperandAValue),
                        thresholdName: getName(rule.validOperandBType, rule.validOperandBValue),
                        operator: rule.validOperator,
                        operatorText: rule.validOperatorText,
                        operatorDescription: RED._('node-red-contrib-sun-position/position-config:common.comparatorDescription.' + rule.validOperator)
                    };
                    if (rule.conditonData.operandName.length > 25) {
                        rule.conditonData.operandNameShort = getNameShort(rule.validOperandAType, rule.validOperandAValue);
                    }
                    if (rule.conditonData.thresholdName.length > 25) {
                        rule.conditonData.thresholdNameShort = getNameShort(rule.validOperandBType, rule.validOperandBValue);
                    }
                }
                if (rule.timeOp === 0) {
                    node.rules.lastUntil = i; // from rule
                    node.rules.checkUntil = true; // from rule
                }
                if (rule.timeOp === 1 && !node.rules.checkFrom) {
                    node.rules.firstFrom = i;
                    node.rules.checkFrom = true; // from rule
                }
            }
            /* if (node.rules.data) {
                node.rules.data.sort((a, b) => {
                    if (a.timeLimited && b.timeLimited) { // both are time limited
                        const top = (a.timeOp - b.timeOp);
                        if (top !== 0) { // from/until type different
                            return top; // from before until
                        }
                    }
                    return a.pos - b.pos;
                });
                node.debug('node.rules.data =' + util.inspect(node.rules.data, { colors: true, compact: 10, breakLength: Infinity }));
            } */
        }
        initialize();
    }

    RED.nodes.registerType('blind-control', sunBlindControlNode);
};