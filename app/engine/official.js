/* 中核5占術の「正式計算」の入口(未実装)
 *
 * 仮計算(engine/provisional.js)とは別ファイル・別名前空間に分けてあります。
 * 正式な暦・天文計算を入れるのはこのファイルだけで、仮計算側には手を入れません。
 * どちらを使うかの切替は engine/index.js の1か所だけで行います。
 *
 * まだ中身がないため available は false です。実装が済むまで engine/index.js は
 * 自動的に仮計算へ戻します(画面が止まらないようにするため)。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.UranaiOfficial = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* 正式計算を入れるために必要になるもの(覚え書き)
   *  - 算命学 : 正式な万年暦にもとづく年月日の干支と蔵干
   *  - 九星気学: 節入り日時(年によって2月3日〜5日で動く)
   *  - 数秘術  : 追加の計算はほぼ不要(現在の仮計算とほぼ同じ手順)
   *  - 西洋占星術: 太陽黄経の計算(星座の境目は年によって前後する)
   *  - 宿曜    : 旧暦(太陰太陽暦)の日付から求める二十七宿
   * いずれも端末内で計算できる範囲にとどめ、外部APIは使いません。
   */

  var AVAILABLE = false;

  function computeOne(key, input) {
    if (!AVAILABLE) { return null; }
    /* 実装時はここに正式計算を書く。仮計算を呼び出さないこと。 */
    return null;
  }

  function computeAll(input) {
    if (!AVAILABLE) { return null; }
    return null;
  }

  function computeOverall(input) {
    if (!AVAILABLE) { return null; }
    /* 実装時は正式な軸対応で5占術の一致点・相違点をまとめる。仮計算を呼び出さないこと。 */
    return null;
  }

  return {
    mode: 'official',
    available: AVAILABLE,
    computeOne: computeOne,
    computeAll: computeAll,
    computeOverall: computeOverall
  };
});
