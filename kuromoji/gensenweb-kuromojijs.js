/*
gensenweb-kuromojijs
日本語形態素解析システム kuromoji.jsをベースとした日本語の専門用語自動抽出システム

Copyright
「専門用語自動抽出システム」は 東京大学情報基盤センター図書館電子化部門中川裕志教授および 横浜国立大学環境情報研究院森辰則助教授が共同で開発したものです。
gensenweb-kuromojijsは主として中川教授、 東京大学前田朗、 東京大学小島浩之講師の３者で検討を重ね、この「専門用語自動抽出システム」を改良したTermExtractをベースに、日本語の専門用語自動抽出の基本機能をnode.js(JavaScript)に移植したものである。
*/
const version = '0.01b';
const IGNORE_WORDS = new Set(["的"]);  // 重要度計算外とする語

let cmp_nouns = [];
let terms = [];  // 複合語リスト作成用の作業用配列

function cmp_noun_list(data) {
  // 和布蕪の形態素解析結果を受け取り、複合語（空白区切りの単名詞）のリストを返す
  let must = 0;  // 次の語が名詞でなければならない場合は真
  const re = "[!\"#$%&'\(\)*+,-./{\|}:;<>\[\]\?!]$";
  cmp_nouns = [];
  // 単名詞の連結処理
  for (const item of data) {
    let noun = item.surface_form;
    let pos = item.pos;
    let cl_1 = item.pos_detail_1;
    let cl_2 = item.pos_detail_2;
    if (pos == "") {
      if (!must) {
        increase(cmp_nouns, terms);
      }
      must = 0;
      continue;
    }
    if (pos === "名詞" && cl_1 === "一般" ||
        pos === "名詞" && cl_1 === "接尾" && cl_2 === "一般" ||
        pos === "名詞" && cl_1 === "接尾" && cl_2 === "サ変接続" ||
        pos === "名詞" && cl_1 === "固有名詞" ||
        pos === "記号" && cl_1 === "アルファベット" ||
        pos === "名詞" && cl_1 === "サ変接続" && !noun.match(re)
      ) {
      terms.push(noun);
      must = 0;
    }
    else if (pos === "名詞" && cl_1 === "形容動詞語幹" ||
      pos == "名詞" && cl_1 === "ナイ形容詞語幹") {
      terms.push(noun);
      must = 1;
    }
    else if (pos === "名詞" && cl_1 === "接尾" && cl_2 == "形容動詞語幹") {
      terms.push(noun);
      must = 1;
    }
    else if (pos === "動詞") {
      terms = [];
    }
    else {
      if (!must) {
        increase(cmp_nouns, terms); 
      }
      must = 0;
      terms = [];     
    }
  }
  if (!must) {
    increase(cmp_nouns, terms);  
  }
  return cmp_nouns;
}

function increase(cmp_nouns, terms) {
  const SETSUBI = new Set(["など", "ら", "上", "内", "型", "間", "中", "毎"]);
  const re = "\s+$";
  //  専門用語リストへ、整形して追加するサブルーチン
  if (terms.length > 1) {
    if (terms[0] === "本") {
      terms.shift();
    }
  }
  if (terms.length > 1) {
    // 語尾の余分な語の削除
    let end = terms.slice(-1)[0];
    if (SETSUBI.has(end) || end.match(re)) {
      terms.pop();
    }
  }
  if (terms.length > 0) {
    cmp_noun = terms.join(" ");
    cmp_nouns.push(cmp_noun);
    terms = [];
  }
}

function modify_agglutinative_lang(data) {
  // 半角スペースで区切られた単名詞を膠着言語（日本語等）向けに成形する
  const re = "[A-Z|a-z]+$";
  let data_disp = "";
  let eng = 0;
  let eng_pre = 0;
  let nouns = data.split(" ");
  for (const noun of nouns) {
    if (noun.match(re)) {
      eng = 1;
    }
    else {
      eng = 0;
    }
    // 前後ともアルファベットなら半角空白空け、それ以外なら区切りなしで連結
    if (eng && eng_pre) {
      data_disp = `${data_disp} ${noun}`;
    }
    else {
      data_disp = data_disp + noun;
    }
    eng_pre = eng;
  }
  return data_disp;
}

function list2key_value(list_data) {
  // リストの要素をキーに、その出現回数を値にしたKey-Valueオブジェクトを返す
  let key_value = {};
  for (const data of list_data) {
    if (data in key_value) {
      key_value[data] += 1;
    }
    else {
      key_value[data] = 1;
    }
  }
  return key_value;
}

function sort_by_importance(keyvalue_data) {
  let word_list = Object.keys(keyvalue_data).map((e)=>({
    cmp_noun: e, importance: keyvalue_data[e] 
  }));
  word_list.sort((a,b) =>  {
    if(a.importance < b.importance) {
      return 1;
    }
    if(a.importance > b.importance) {
      return -1;
    }
    return 0;
  });
  return word_list;
}

function score_lr(frequency, ignore_words=IGNORE_WORDS, average_rate=1, lr_mode=1) {
  // LRによる重要度計算を行う（学習なし）
  const re1 = "\s*$";
  const re2 = "[\d\.\,]+$";
  let noun_importance = {};  // 「専門用語」をキー、値を「重要度」
  let stat = stat_lr(frequency, ignore_words, lr_mode);
  for (cmp_noun of Object.keys(frequency)) {
    let importance = 1;  // 専門用語全体の重要度
    let count = 0;  // ループカウンター（専門用語中の単名詞数をカウント）
    if (!cmp_noun.match(re1)) {
      continue;
    }
    for (noun of cmp_noun.split(" ")) {
      if (noun.match(re2)) {
        continue;
      }
      let left_score = 0;
      let right_score = 0;
      if (stat[noun])  {
        let score = stat[noun];
        left_score = score[0];
        right_score = score[1];
      }
      importance *= (left_score + 1) * (right_score + 1);
      count += 1;
    }
    if (count === 0) {
      count = 1;
    }
    // 相乗平均でlr重要度を出す
    importance = importance ** (1 / (2 * average_rate * count));
    noun_importance[cmp_noun] = importance;
    count = 0;
  }
  return noun_importance;
}

function stat_lr(frequency, ignore_words=IGNORE_WORDS, lr_mode=1) {
  // LRの統計情報を得る
  let stat = {};  // 単名詞ごとの連接情報
  const re = "[\d\.\,]+$";
  // 専門用語ごとにループ
  for (cmp_noun of Object.keys(frequency)) {
    if (!cmp_noun) {
      continue;
    }
    org_nouns = cmp_noun.split(" ");
    nouns = [];
    // 数値及び指定の語を重要度計算から除外
    for (noun of org_nouns) {
      if (ignore_words) {
        if (ignore_words[noun] != undefined) {
          continue;
        }
        else if (noun.match(re)) {
          continue;
        }
      }
      nouns.push(noun);
    }
    if (nouns.length > 1) {
      for (let i=0; i < nouns.length-1; i++) {
        if (stat[nouns[i]] == undefined) {
          stat[nouns[i]] = [0, 0];
        }
        if (stat[nouns[i+1]] == undefined) {
          stat[nouns[i+1]] = [0, 0];
        }
        if (lr_mode == 2) { //   # 連接語の”異なり数”をとる場合
          stat[nouns[i]][0] += 1;
          stat[nouns[i+1]][1] += 1;
        }
        else {  // 連接語の”延べ数”をとる場合
          stat[nouns[i]][0] += frequency[cmp_noun];
          stat[nouns[i+1]][1] += frequency[cmp_noun];
        }
      }
    }
  }
  return(stat);
}

function term_importance(...args) {
  // 複数のKey-Value(連想配列）形式の値同士を乗算する
  let master = {};
  let new_master = {}
  for (noun_dict of args) {
    for (let nouns of Object.keys(noun_dict)) {
      let importance = noun_dict[nouns];
      if (master[nouns] != undefined) {
        new_master[nouns] = master[nouns] * importance;
      }
      else {
        new_master[nouns] = importance;
      }
    }
    master = new_master;
  }
  return master;
}
