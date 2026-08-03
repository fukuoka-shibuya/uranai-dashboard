/* 占術エンジンの切替点
 *
 * 仮計算(provisional.js)と正式計算(official.js)のどちらを使うかを決める
 * 場所は、このファイルの MODE 一か所だけです。画面側(app/index.html)は
 * UranaiEngine.computeOne / computeAll だけを呼び、どちらが動いているかを
 * 意識しません。
 */
(function (root, factory) {
  var provisional = (typeof module === 'object' && module.exports)
    ? require('./provisional.js') : root.UranaiProvisional;
  var official = (typeof module === 'object' && module.exports)
    ? require('./official.js') : root.UranaiOfficial;

  var api = factory(provisional, official);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.UranaiEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (provisional, official) {
  'use strict';

  /* 'provisional' … 試作用の仮計算(いまはこちら)
     'official'    … 正式計算。official.available が true になったら切り替える */
  var MODE = 'provisional';

  /** いま実際に使われている実装を返す。正式計算が未実装なら仮計算へ戻す */
  function active() {
    if (MODE === 'official' && official && official.available) { return official; }
    return provisional;
  }

  function isProvisional() { return active().mode === 'provisional'; }

  /** 生年月日が読み取れる形かどうか。理由の文言も返す */
  function validate(input) {
    if (!input || !input.birthdate) {
      return { ok: false, message: '生年月日を入れていただくと読み解けます。' };
    }
    if (!provisional.util.parseDate(input.birthdate)) {
      return { ok: false, message: '生年月日の形が読み取れませんでした。もう一度お確かめください。' };
    }
    return { ok: true, message: '' };
  }

  return {
    mode: MODE,
    order: provisional.order.slice(),
    extraOrder: (provisional.extraOrder || []).slice(),
    isProvisional: isProvisional,
    validate: validate,
    computeOne: function (key, input) { return active().computeOne(key, input); },
    computeAll: function (input) { return active().computeAll(input); },
    computeOverall: function (input) { return active().computeOverall(input); }
  };
});
