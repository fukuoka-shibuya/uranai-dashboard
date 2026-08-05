/* 占術エンジンの切替点
 *
 * 仮計算(provisional.js)と正式計算(official.js)のどちらを使うかを決める
 * 場所は、このファイルの OFFICIAL_KEYS 一か所だけです。画面側(app/index.html)は
 * UranaiEngine.computeOne / computeAll / computeOverall だけを呼び、どちらが
 * 動いているかを意識しません。
 *
 * Issue #35(2026-08-04 オーナー指示)により、正式計算は1サイクル1占術ずつ
 * 切り替えます(算命学→九星気学→数秘術→西洋占星術→宿曜)。切り替え済みの
 * 占術だけが official.js で計算され、残りは従来どおり仮計算で動きます。
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

  /* 正式計算へ切り替え済みの占術。ここに足すことが「切り替え」のすべて。
     official.js 側に実装が無い占術を誤って足しても、下の implFor が
     supports() で確かめてから使うため、画面が止まることはない */
  var OFFICIAL_KEYS = ['sanmei', 'kyusei', 'suuhi', 'seiyou', 'sukuyo'];

  /** その占術で実際に使う実装を返す。正式計算が未実装なら仮計算へ戻す */
  function implFor(key) {
    if (OFFICIAL_KEYS.indexOf(key) >= 0 &&
        official && typeof official.supports === 'function' && official.supports(key)) {
      return official;
    }
    return provisional;
  }

  /** 総合占いをどちらで組むか。
      総合は中核5占術の計算値を束ねる上位の読み物なので、1つでも仮計算のままだと
      仮と正式の値が混ざる。全部そろってから正式計算へ渡し、それまでは仮計算で
      一貫させる(安全側)。official 側に総合の実装が無い場合も仮計算へ戻す */
  function overallImpl() {
    for (var i = 0; i < provisional.order.length; i++) {
      if (implFor(provisional.order[i]) !== official) { return provisional; }
    }
    if (official && typeof official.supportsOverall === 'function' && official.supportsOverall()) {
      return official;
    }
    return provisional;
  }

  /** key を渡すとその占術が仮計算かどうか。渡さないと「仮計算が1つでも残っているか」
      (総合占いも数える。以前はここが恒 true だった=台帳 OC35a-L4) */
  function isProvisional(key) {
    if (key) { return implFor(key) === provisional; }
    var keys = provisional.order.concat(provisional.extraOrder || []);
    for (var i = 0; i < keys.length; i++) {
      if (implFor(keys[i]) === provisional) { return true; }
    }
    return overallImpl() === provisional;
  }

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

  function computeOne(key, input) { return implFor(key).computeOne(key, input); }

  function computeAll(input) {
    var out = {};
    for (var i = 0; i < provisional.order.length; i++) {
      out[provisional.order[i]] = computeOne(provisional.order[i], input);
    }
    return out;
  }

  return {
    /* 全占術が正式計算へ切り替わるまでは 'mixed'(混在)。切替の実体は OFFICIAL_KEYS */
    mode: OFFICIAL_KEYS.length === 0 ? 'provisional' : 'mixed',
    officialKeys: OFFICIAL_KEYS.slice(),
    order: provisional.order.slice(),
    extraOrder: (provisional.extraOrder || []).slice(),
    isProvisional: isProvisional,
    validate: validate,
    computeOne: computeOne,
    computeAll: computeAll,
    /* 中核5占術がすべて正式計算に切り替わったので、総合占いも正式計算側で組む
       (cycle-0043)。切替の実体は上の OFFICIAL_KEYS のままで、ここに別の設定は置かない */
    overallIsOfficial: function () { return overallImpl() === official; },
    computeOverall: function (input) { return overallImpl().computeOverall(input); }
  };
});
