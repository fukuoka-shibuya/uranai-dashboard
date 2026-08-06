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

  /* ---------- 占いの案内(Issue #50・2026-08-06 オーナー指示) ----------
     「この文章自体が何を意味しているのか分からない。私の性格を表しているのか今年の運勢な
     のかも分からない。『中心の星』がそもそも何なのかも分からない」という指摘への対応。

     これまで画面に出ていたのは「その人の値がどういう意味か」(items[].note)だけで、
       (1) その占いがそもそも何を読むものなのか
       (2) 項目名(用語)そのものが何を指すのか
     が どこにも無かった。この2つを READING / ABOUT として添える。

     この2つは「値によらず一定の説明」なので、仮計算と正式計算のどちらが動いていても
     同じ文になる。だからこそ実装の分かれ道ではなく、両方の合流点であるこのファイルに
     置く(provisional.js と official.js に分けて持つと二重管理になり、切替のたびに
     説明だけ古くなる。台帳 OC48-L1 と同じ失敗を繰り返さないための置き場所)。
     ABOUT は項目名で引くので、仮計算だけにある項目名(気の配り方・人との間合い など)も
     正式計算だけにある項目名(年の干支・月の干支 など)も両方そろえてある。 */
  /* ---------- 用語をやめる(Issue #51・2026-08-06 オーナー指示) ----------
     #50 で案内と用語説明を足したあとも「意味が分からないのは変わっていない。まず
     ○○の柱です。これも意味が分からない。前提知識がない人でも分かるように区分や組も
     やめて。全体的に訂正が必要」という続報が届いた。

     原因は、画面の見出し(項目名)そのものが占いの用語だったこと。「日の干支」
     「中心の星」「三区分」「宿の系統」は、それが何の話なのかを知っている人にしか
     読めない。説明を足しても、見出しが用語のままでは読み手は最初の一行でつまずく。

     そこで見出しを入れ替える。主役を「平易な言い換え」(plain)にし、占いでの
     呼び名(term)は「占いの言葉では〜」という従の一行へ落とす。
       plain … 画面の見出し。前提知識ゼロで読める現代語だけで書く
       term  … 占いでの呼び名。もとの用語を捨てずに残す場所(占いに親しんだ人向け)
       about … その言葉が何を指すか(#50 で新設。今回すべて平易な語へ書き直した)

     label(実装が付けた項目名)は内部の鍵として据え置く。表の引き当ても、既存の
     計算検査(official.spec が valuesOf(r)['日の干支'] で引く)も label のままで動く。
     画面に出る文字だけを入れ替えるので、占いの結果の値は一つも変わらない。

     置き場所を仮計算と正式計算の合流点にしている理由は #50 と同じで、切替のたびに
     説明だけ古くなる事故(台帳 OC48-L1)を避けるため。仮計算だけにある項目名も
     正式計算だけにある項目名も、両方この1か所に載せる。 */
  var READING = {
    sanmei: '算命学は、生まれた日を昔の暦の言い方に置きかえて、その人が生まれつき持っている気の配り方や動き方のくせを読むものです。今年がどうなるか、今日何が起きるかを言い当てるものではありません。移り変わるものではなく、変わりにくい持ち味のほうを眺める見方と見ます。',
    kyusei: '九星気学は、生まれた年と月を昔の暦で数え直し、九つある星のどれに当たるかを見て、その巡りの中で自分がどのあたりに置かれやすいかを読むものです。生まれ持った性格そのものを言い切るものではありません。この先の出来事を告げるものでもないとされています。',
    suuhi: '数秘術は、生年月日の数字を決まったやり方で足し縮め、出てきた一つの数に置きかえて性質を読むものです。今年の運勢やこの先の出来事を数から言い当てるものではありません。日々の選び方に出るくせを眺める見方のようです。',
    seiyou: '西洋占星術は、生まれた日に太陽が空のどこにいたかを計算し、そこから力の出やすい場面を読むものです。今日や今年の運勢を空から告げるものではありません。生まれた日の空の眺めを手がかりにする見方でしょう。',
    sukuyo: '宿曜は、生まれた日を月の満ち欠けの暦に直し、その日に月が空のどこにいたかから、人との間に流れる調子を読むものです。相手との相性の良し悪しを決めつけたり、この先の出来事を告げたりするものではないと読み取れます。',
    seimei: '姓名判断は、占いたい名前の画数を数え合わせて、その名前がまとう雰囲気を読むものです。名前で人の値打ちやこの先が決まると述べるものではありません。呼び名の手触りを眺めるものと映ります。'
  };

  /* 項目名の表。鍵は実装が付けた label。値は
       plain … 画面の見出し(前提知識ゼロの現代語)
       term  … 占いでの呼び名(空文字なら、もともと平易なので併記しない)
       about … その言葉が何を指すか */
  var GUIDE = {
    sanmei: {
      '日の干支': {
        plain: '生まれた日をあらわす二文字', term: '日の干支',
        about: '生まれた日を、昔の暦の言い方にならって二文字に置きかえたものです。読み解きはここを出発点にして、生まれた年や月の二文字も合わせて広げていきます。'
      },
      '中心の星': {
        plain: 'その人の芯にある動き方', term: '中心の星',
        about: '生まれた日をもとに、その人がいちばん出しやすい動き方を、算命学に古くからある十の呼び名のうち一つで言い表したものです。'
      },
      '年の干支': {
        plain: 'まわりから見えやすい面', term: '年の干支',
        about: '生まれた年を、春の始まりを一年の変わり目とする昔の暦で数え直し、二文字に置きかえたものです。'
      },
      '月の干支': {
        plain: 'ふだんの暮らしに出る面', term: '月の干支',
        about: '生まれた月を、昔の暦の月の変わり目で区切り直し、二文字に置きかえたものです。'
      },
      '本元の気': {
        plain: '持って生まれた気の向き', term: '本元の気',
        about: '生まれた日をあらわす二文字のうち初めの一字を、木・火・土・金・水という五つの見立てのどれかに当てはめたものです。'
      },
      '気の配り方': {
        plain: '気の配り方', term: '',
        about: 'その人の気がどの範囲へどう向かいやすいかを、四つの出方に分けて見るところです。'
      },
      '人との間合い': {
        plain: '人との間合い', term: '',
        about: '相手とのあいだに、ふだんどれくらいの距離を取りやすいかを、三つの出方で見るところです。'
      },
      '動き出しの型': {
        plain: '動き出しまでの間の取り方', term: '',
        about: '物事に取りかかるまでにどれくらい間を置くかを、三つの出方に分けて見るところです。'
      },
      '天中殺の組': {
        plain: '立ち止まりやすい時期', term: '天中殺',
        about: '暦を十日ずつのまとまりで見たとき、そのまとまりに入りきらずに余る二つの動物の名を取った、算命学に古くからある時期の呼び名です。'
      }
    },
    kyusei: {
      '本命星': {
        plain: '生まれた年から見た自分の星', term: '本命星',
        about: '生まれた年を、春の始まりを変わり目として数え直し、九つある星の呼び名のどれに当たるかを示したものです。'
      },
      '月命星': {
        plain: '生まれた月から見た自分の星', term: '月命星',
        about: '生まれた月を昔の暦の月の変わり目で区切り直し、その月に九つの星の並びの真ん中へ来る星を示したものです。生まれた年の星に合わせて決まります。'
      },
      '星の色': {
        plain: '星に結び付いた色', term: '',
        about: '九つの星それぞれに昔から結び付けられている色で、星の呼び名の中にも入っています。'
      },
      '定位の方角': {
        plain: 'もともとの居場所の方角', term: '',
        about: '九つの星を並べた図の上で、その星がもともと置かれるとされる場所の方角です。'
      }
    },
    suuhi: {
      'ライフパスナンバー': {
        plain: '生き方をあらわす数', term: 'ライフパスナンバー',
        about: '生年月日の数字をすべて足し、一けたになるまで足し縮めて出した数です。数秘術ではこの数を読み解きの中心に置きます。'
      },
      '誕生数': {
        plain: '生まれた日だけからの数', term: '誕生数',
        about: '生年月日のうち日にちの部分だけを取り出し、同じやり方で足し縮めた数です。'
      },
      '数の性質': {
        plain: '数の並び方', term: '',
        about: '生き方をあらわす数が偶数か奇数か、同じ数字が並んでいるかという、数そのものの見え方です。'
      },
      '数の重なり': {
        plain: '二つの数の近さ', term: '',
        about: '生き方をあらわす数と、生まれた日だけからの数が同じかどうかを見るところです。'
      }
    },
    seiyou: {
      '太陽星座': {
        plain: '生まれた日の星座', term: '太陽星座',
        about: '生まれた日に太陽が空のどのあたりにいたかを、十二の星座の名で表したものです。ふだん「何座」と呼ばれているのがこれです。'
      },
      'エレメント': {
        plain: '火・地・風・水のどれか', term: '',
        about: '十二の星座を、火・地・風・水という四つの見立てに分けた、西洋に古くからある分け方です。'
      },
      '三区分': {
        plain: '力の出し方', term: '',
        about: '十二の星座を、自分から始める・同じことを続ける・まわりに合わせる、という三つの出方に分けたものです。'
      },
      '向かい合う星座': {
        plain: '正面にある星座', term: '',
        about: '空を輪にして並べたとき、生まれた日の星座のちょうど反対側に来る星座のことです。'
      }
    },
    sukuyo: {
      '生まれの宿': {
        plain: '生まれた日に月がいた場所', term: '生まれの宿',
        about: '月が空を一周する道すじを二十七に分け、生まれた日に月がどこにいたとされるかを示した場所の名です。'
      },
      '旧暦の生まれ日': {
        plain: '昔の暦での生まれた日', term: '旧暦の生まれ日',
        about: '生年月日を、月の満ち欠けをもとにした昔の暦に直した日付です。宿曜はこの日付から月の居場所を数えます。'
      },
      '宿の系統': {
        plain: '人との付き合い方の型', term: '',
        about: '二十七ある月の居場所を、似た性質どうし七つのまとまりにまとめた、宿曜に古くからある呼び名です。'
      },
      '巡りの位置': {
        plain: '二十七のうちの何番目か', term: '',
        about: '二十七の場所を順に並べた輪の中で、生まれた日の場所が何番目に当たるかを示す数です。'
      },
      '人との調子': {
        plain: '人と向き合うときの調子', term: '',
        about: '相手と向き合ったときに流れやすい調子を、三つの言い方に分けたものです。'
      }
    },
    seimei: {
      '総画': {
        plain: '名前ぜんぶの画数', term: '総画',
        about: '入力された名前を一字ずつ画数に置きかえ、その合計として出した数です。'
      },
      '画の型': {
        plain: '画数を一けたに縮めた数', term: '画の型',
        about: '名前ぜんぶの画数を一けたになるまで足し縮め、一から九のどれに当たるかで見るものです。'
      },
      '頭字の画': {
        plain: 'はじめの一字の画数', term: '',
        about: '名前のいちばん初めの一字が持つ画数で、出だしの印象を見る手がかりにします。'
      },
      '結字の画': {
        plain: '終わりの一字の画数', term: '',
        about: '名前の最後に置かれた一字の画数で、結びの印象を読むところです。'
      }
    }
  };

  function own(obj, name) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, name);
  }

  function guideFor(key, label) {
    var t = GUIDE[key];
    return (t && own(t, label)) ? t[label] : null;
  }

  /** 計算結果へ案内(reading)と項目ごとの案内(plain・term・about)を添える。
      元のオブジェクトは書き換えず写しを返す(実装側が表を使い回していても汚さない)。
      label は内部の鍵として据え置く。画面が見出しに使うのは plain(Issue #51) */
  function withGuide(key, result) {
    if (!result || typeof result !== 'object') { return result; }
    var out = {}, name;
    for (name in result) { if (own(result, name)) { out[name] = result[name]; } }
    if (READING[key]) { out.reading = READING[key]; }
    if (Object.prototype.toString.call(result.items) === '[object Array]') {
      out.items = result.items.map(function (item) {
        var copy = {}, p;
        for (p in item) { if (own(item, p)) { copy[p] = item[p]; } }
        var g = guideFor(key, item.label);
        if (g) {
          copy.about = g.about;
          copy.plain = g.plain;
          copy.term = g.term;
        }
        return copy;
      });
    }
    return out;
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

  function computeOne(key, input) { return withGuide(key, implFor(key).computeOne(key, input)); }

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
    /* Issue #50 の案内。検査から表そのものを引けるようにする(画面と同じ出どころ) */
    readingOf: function (key) { return READING[key] || ''; },
    aboutOf: function (key, label) {
      var g = guideFor(key, label); return g ? g.about : '';
    },
    /* Issue #51。画面の見出し(平易な言い換え)と、占いでの呼び名 */
    plainOf: function (key, label) {
      var g = guideFor(key, label); return g ? g.plain : '';
    },
    termOf: function (key, label) {
      var g = guideFor(key, label); return g ? g.term : '';
    },
    /* 中核5占術がすべて正式計算に切り替わったので、総合占いも正式計算側で組む
       (cycle-0043)。切替の実体は上の OFFICIAL_KEYS のままで、ここに別の設定は置かない */
    overallIsOfficial: function () { return overallImpl() === official; },
    computeOverall: function (input) { return overallImpl().computeOverall(input); }
  };
});
