// parse.js — a fast CommonMark 0.31.2 + GFM renderer, written from scratch.
// parse(markdown) returns exactly the HTML marked 18.1.3 renders with its
// default options (gfm on, breaks off). Dependency-free ES module.
// Written fresh from the CommonMark/GFM specifications and the practice set's
// input->expected pairs; no marked source was read or copied.

'use strict';

// ---------------------------------------------------------------- utilities

const ASCII_PUNCT = '!\"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
function isAsciiPunct(c) { return c.length === 1 && ASCII_PUNCT.indexOf(c) >= 0; }
function isSpace(c) { return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\v' || c === '\f'; }
// Unicode whitespace per CommonMark (space, tab, LF, FF, CR + NBSP, OGHAM,
// EN QUAD..HAIR SPACE, NNBSP, MMSP, IDEOGRAPHIC SPACE, ZWNBSP).
function isUnicodeSpace(c) {
  if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\v' || c === '\f') return true;
  const cp = c.codePointAt(0);
  return cp === 0x00a0 || cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200a) ||
    cp === 0x202f || cp === 0x205f || cp === 0x3000 || cp === 0xfeff;
}
const PUNCT_RE = /[\p{P}\p{S}]/u;
function isUnicodePunct(c) {
  if (c.length === 0) return false;
  const cp = c.codePointAt(0);
  if (cp < 128) return ASCII_PUNCT.indexOf(c) >= 0;
  return PUNCT_RE.test(c);
}
function isLetter(c) { return /[A-Za-z]/.test(c); }
function isDigit(c) { return c >= '0' && c <= '9'; }
function isAlnum(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'); }
function isHex(c) { return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }

// ---------------------------------------------------------------- entities
// HTML5 named character references (standard list). Kept as one long line so
// lookup is a single indexOf on a ';'-delimited string.
const ENTITY_NAMES = ';AElig;AMP;Aacute;Abreve;Acirc;Acy;Afr;Agrave;Alpha;Amacr;And;Aogon;Aopf;ApplyFunction;Aring;Ascr;Assign;Atilde;Auml;Backslash;Barv;Barwed;Bcy;Because;Bernoullis;Beta;Bfr;Bopf;Breve;Bscr;Bumpeq;CHcy;COPY;Cacute;Cap;CapitalDifferentialD;Cayleys;Ccaron;Ccedil;Ccirc;Cconint;Cdot;Cedilla;CenterDot;Cfr;Chi;CircleDot;CircleMinus;CirclePlus;CircleTimes;ClockwiseContourIntegral;CloseCurlyDoubleQuote;CloseCurlyQuote;Colon;Colone;Congruent;Conint;ContourIntegral;Copf;Coproduct;CounterClockwiseContourIntegral;Cross;Cscr;Cup;CupCap;DD;DDotrahd;DJcy;DScy;DZcy;Dagger;Darr;Dashv;Dcaron;Dcy;Del;Delta;Dfr;DiacriticalAcute;DiacriticalDot;DiacriticalDoubleAcute;DiacriticalGrave;DiacriticalTilde;Diamond;DifferentialD;Dopf;Dot;DotDot;DotEqual;DoubleContourIntegral;DoubleDot;DoubleDownArrow;DoubleLeftArrow;DoubleLeftRightArrow;DoubleLeftTee;DoubleLongLeftArrow;DoubleLongLeftRightArrow;DoubleLongRightArrow;DoubleRightArrow;DoubleRightTee;DoubleUpArrow;DoubleUpDownArrow;DoubleVerticalBar;DownArrow;DownArrowBar;DownArrowUpArrow;DownBreve;DownLeftRightVector;DownLeftTeeVector;DownLeftVector;DownLeftVectorBar;DownRightTeeVector;DownRightVector;DownRightVectorBar;DownTee;DownTeeArrow;Downarrow;Dscr;Dstrok;ENG;ETH;Eacute;Ecaron;Ecirc;Ecy;Edot;Efr;Egrave;Element;Emacr;EmptySmallSquare;EmptyVerySmallSquare;Eogon;Eopf;Epsilon;Equal;EqualTilde;Equilibrium;Escr;Esim;Eta;Euml;Exists;ExponentialE;Fcy;Ffr;FilledSmallSquare;FilledVerySmallSquare;Fopf;ForAll;Fouriertrf;Fscr;GJcy;GT;Gamma;Gammad;Gbreve;Gcedil;Gcirc;Gcy;Gdot;Gfr;Gg;Gopf;GreaterEqual;GreaterEqualLess;GreaterFullEqual;GreaterGreater;GreaterLess;GreaterSlantEqual;GreaterTilde;Gscr;Gt;HARDcy;Hacek;Hat;Hcirc;Hfr;HilbertSpace;Hopf;HorizontalLine;Hscr;Hstrok;HumpDownHump;HumpEqual;IEcy;IJlig;IOcy;Iacute;Icirc;Icy;Idot;Ifr;Igrave;Im;Imacr;ImaginaryI;Implies;Int;Integral;Intersection;InvisibleComma;InvisibleTimes;Iogon;Iopf;Iota;Iscr;Itilde;Iukcy;Iuml;Jcirc;Jcy;Jfr;Jopf;Jscr;Jsercy;Jukcy;KHcy;KJcy;Kappa;Kcedil;Kcy;Kfr;Kopf;Kscr;LJcy;LT;Lacute;Lambda;Lang;Laplacetrf;Larr;Lcaron;Lcedil;Lcy;LeftAngleBracket;LeftArrow;LeftArrowBar;LeftArrowRightArrow;LeftCeiling;LeftDoubleBracket;LeftDownTeeVector;LeftDownVector;LeftDownVectorBar;LeftFloor;LeftRightArrow;LeftRightVector;LeftTee;LeftTeeArrow;LeftTeeVector;LeftTriangle;LeftTriangleBar;LeftTriangleEqual;LeftUpDownVector;LeftUpTeeVector;LeftUpVector;LeftUpVectorBar;LeftVector;LeftVectorBar;Leftarrow;Leftrightarrow;LessEqualGreater;LessFullEqual;LessGreater;LessLess;LessSlantEqual;LessTilde;Lfr;Ll;Lleftarrow;Lmidot;LongLeftArrow;LongLeftRightArrow;LongRightArrow;Longleftarrow;Longleftrightarrow;Longrightarrow;Lopf;LowerLeftArrow;LowerRightArrow;Lscr;Lsh;Lstrok;Lt;Map;Mcy;MediumSpace;Mellintrf;Mfr;MinusPlus;Mopf;Mscr;Mu;NJcy;Nacute;Ncaron;Ncedil;Ncy;NegativeMediumSpace;NegativeThickSpace;NegativeThinSpace;NegativeVeryThinSpace;NestedGreaterGreater;NestedLessLess;NewLine;Nfr;NoBreak;NonBreakingSpace;Nopf;Not;NotCongruent;NotCupCap;NotDoubleVerticalBar;NotElement;NotEqual;NotEqualTilde;NotExists;NotGreater;NotGreaterEqual;NotGreaterFullEqual;NotGreaterGreater;NotGreaterLess;NotGreaterSlantEqual;NotGreaterTilde;NotHumpDownHump;NotHumpEqual;NotLeftTriangle;NotLeftTriangleBar;NotLeftTriangleEqual;NotLess;NotLessEqual;NotLessGreater;NotLessLess;NotLessSlantEqual;NotLessTilde;NotNestedGreaterGreater;NotNestedLessLess;NotPrecedes;NotPrecedesEqual;NotPrecedesSlantEqual;NotReverseElement;NotRightTriangle;NotRightTriangleBar;NotRightTriangleEqual;NotSquareSubset;NotSquareSubsetEqual;NotSquareSuperset;NotSquareSupersetEqual;NotSubset;NotSubsetEqual;NotSucceeds;NotSucceedsEqual;NotSucceedsSlantEqual;NotSucceedsTilde;NotSuperset;NotSupersetEqual;NotTilde;NotTildeEqual;NotTildeFullEqual;NotTildeTilde;NotVerticalBar;Nscr;Ntilde;Nu;OElig;Oacute;Ocirc;Ocy;Odblac;Ofr;Ograve;Omacr;Omega;Omicron;Oopf;OpenCurlyDoubleQuote;OpenCurlyQuote;Or;Oscr;Oslash;Otilde;Otimes;Ouml;OverBar;OverBrace;OverBracket;OverParenthesis;PartialD;Pcy;Pfr;Phi;Pi;PlusMinus;Poincareplane;Popf;Pr;Precedes;PrecedesEqual;PrecedesSlantEqual;PrecedesTilde;Prime;Product;Proportion;Proportional;Pscr;Psi;QUOT;Qfr;Qopf;Qscr;RBarr;REG;Racute;Rang;Rarr;Rarrtl;Rcaron;Rcedil;Rcy;Re;ReverseElement;ReverseEquilibrium;ReverseUpEquilibrium;Rfr;Rho;RightAngleBracket;RightArrow;RightArrowBar;RightArrowLeftArrow;RightCeiling;RightDoubleBracket;RightDownTeeVector;RightDownVector;RightDownVectorBar;RightFloor;RightTee;RightTeeArrow;RightTeeVector;RightTriangle;RightTriangleBar;RightTriangleEqual;RightUpDownVector;RightUpTeeVector;RightUpVector;RightUpVectorBar;RightVector;RightVectorBar;Rightarrow;Ropf;RoundImplies;Rrightarrow;Rscr;Rsh;RuleDelayed;SHCHcy;SHcy;SOFTcy;Sacute;Sc;Scaron;Scedil;Scirc;Scy;Sfr;ShortDownArrow;ShortLeftArrow;ShortRightArrow;ShortUpArrow;Sigma;SmallCircle;Sopf;Sqrt;Square;SquareIntersection;SquareSubset;SquareSubsetEqual;SquareSuperset;SquareSupersetEqual;SquareUnion;Sscr;Star;Sub;Subset;SubsetEqual;Succeeds;SucceedsEqual;SucceedsSlantEqual;SucceedsTilde;SuchThat;Sum;Sup;Superset;SupersetEqual;Supset;THORN;TRADE;TSHcy;TScy;Tab;Tau;Tcaron;Tcedil;Tcy;Tfr;Therefore;Theta;ThickSpace;ThinSpace;Tilde;TildeEqual;TildeFullEqual;TildeTilde;Topf;TripleDot;Tscr;Tstrok;Uacute;Uarr;Uarrocir;Ubrcy;Ubreve;Ucirc;Ucy;Udblac;Ufr;Ugrave;Umacr;UnderBar;UnderBrace;UnderBracket;UnderParenthesis;Union;UnionPlus;Uogon;Uopf;UpArrow;UpArrowBar;UpArrowDownArrow;UpDownArrow;UpEquilibrium;UpTee;UpTeeArrow;Uparrow;Updownarrow;UpperLeftArrow;UpperRightArrow;Upsi;Upsilon;Uring;Uscr;Utilde;Uuml;VDash;Vbar;Vcy;Vdash;Vdashl;Vee;Verbar;Vert;VerticalBar;VerticalLine;VerticalSeparator;VerticalTilde;VeryThinSpace;Vfr;Vopf;Vscr;Vvdash;Wcirc;Wedge;Wfr;Wopf;Wscr;Xfr;Xi;Xopf;Xscr;YAcy;YIcy;YUcy;Yacute;Ycirc;Ycy;Yfr;Yopf;Yscr;Yuml;ZHcy;Zacute;Zcaron;Zcy;Zdot;ZeroWidthSpace;Zeta;Zfr;Zopf;Zscr;aacute;abreve;ac;acE;acd;acirc;acute;acy;aelig;af;afr;agrave;alefsym;aleph;alpha;amacr;amalg;amp;and;andand;andd;andslope;andv;ang;ange;angle;angmsd;angmsdaa;angmsdab;angmsdac;angmsdad;angmsdae;angmsdaf;angmsdag;angmsdah;angrt;angrtvb;angrtvbd;angsph;angst;angzarr;aogon;aopf;ap;apE;apacir;ape;apid;apos;approx;approxeq;aring;ascr;ast;asymp;asympeq;atilde;auml;awconint;awint;bNot;backcong;backepsilon;backprime;backsim;backsimeq;barvee;barwed;barwedge;bbrk;bbrktbrk;bcong;bcy;bdquo;becaus;because;bemptyv;bepsi;bernou;beta;beth;between;bfr;bigcap;bigcirc;bigcup;bigodot;bigoplus;bigotimes;bigsqcup;bigstar;bigtriangledown;bigtriangleup;biguplus;bigvee;bigwedge;bkarow;blacklozenge;blacksquare;blacktriangle;blacktriangledown;blacktriangleleft;blacktriangleright;blank;blk12;blk14;blk34;block;bne;bnequiv;bnot;bopf;bot;bottom;bowtie;boxDL;boxDR;boxDl;boxDr;boxH;boxHD;boxHU;boxHd;boxHu;boxUL;boxUR;boxUl;boxUr;boxV;boxVH;boxVL;boxVR;boxVh;boxVl;boxVr;boxbox;boxdL;boxdR;boxdl;boxdr;boxh;boxhD;boxhU;boxhd;boxhu;boxminus;boxplus;boxtimes;boxuL;boxuR;boxul;boxur;boxv;boxvH;boxvL;boxvR;boxvh;boxvl;boxvr;bprime;breve;brvbar;bscr;bsemi;bsim;bsime;bsol;bsolb;bsolhsub;bull;bullet;bump;bumpE;bumpe;bumpeq;cacute;cap;capand;capbrcup;capcap;capcup;capdot;caps;caret;caron;ccaps;ccaron;ccedil;ccirc;ccups;ccupssm;cdot;cedil;cemptyv;cent;centerdot;cfr;chcy;check;checkmark;chi;cir;cirE;circ;circeq;circlearrowleft;circlearrowright;circledR;circledS;circledast;circledcirc;circleddash;cire;cirfnint;cirmid;cirscir;clubs;clubsuit;colon;colone;coloneq;comma;commat;comp;compfn;complement;complexes;cong;congdot;conint;copf;coprod;copy;copysr;crarr;cross;cscr;csub;csube;csup;csupe;ctdot;cudarrl;cudarrr;cuepr;cuesc;cularr;cularrp;cup;cupbrcap;cupcap;cupcup;cupdot;cupor;cups;curarr;curarrm;curlyeqprec;curlyeqsucc;curlyvee;curlywedge;curren;curvearrowleft;curvearrowright;cuvee;cuwed;cwconint;cwint;cylcty;dArr;dHar;dagger;daleth;darr;dash;dashv;dbkarow;dblac;dcaron;dcy;dd;ddagger;ddarr;ddotseq;deg;delta;demptyv;dfisht;dfr;dharl;dharr;diam;diamond;diamondsuit;diams;die;digamma;disin;div;divide;divideontimes;divonx;djcy;dlcorn;dlcrop;dollar;dopf;dot;doteq;doteqdot;dotminus;dotplus;dotsquare;doublebarwedge;downarrow;downdownarrows;downharpoonleft;downharpoonright;drbkarow;drcorn;drcrop;dscr;dscy;dsol;dstrok;dtdot;dtri;dtrif;duarr;duhar;dwangle;dzcy;dzigrarr;eDDot;eDot;eacute;easter;ecaron;ecir;ecirc;ecolon;ecy;edot;ee;efDot;efr;eg;egrave;egs;egsdot;el;elinters;ell;els;elsdot;emacr;empty;emptyset;emptyv;emsp;emsp13;emsp14;eng;ensp;eogon;eopf;epar;eparsl;eplus;epsi;epsilon;epsiv;eqcirc;eqcolon;eqsim;eqslantgtr;eqslantless;equals;equest;equiv;equivDD;eqvparsl;erDot;erarr;escr;esdot;esim;eta;eth;euml;euro;excl;exist;expectation;exponentiale;fallingdotseq;fcy;female;ffilig;fflig;ffllig;ffr;filig;fjlig;flat;fllig;fltns;fnof;fopf;forall;fork;forkv;fpartint;frac12;frac13;frac14;frac15;frac16;frac18;frac23;frac25;frac34;frac35;frac38;frac45;frac56;frac58;frac78;frasl;frown;fscr;gE;gEl;gacute;gamma;gammad;gap;gbreve;gcirc;gcy;gdot;ge;gel;geq;geqq;geqslant;ges;gescc;gesdot;gesdoto;gesdotol;gesl;gesles;gfr;gg;ggg;gimel;gjcy;gl;glE;gla;glj;gnE;gnap;gnapprox;gne;gneq;gneqq;gnsim;gopf;grave;gscr;gsim;gsime;gsiml;gt;gtcc;gtcir;gtdot;gtlPar;gtquest;gtrapprox;gtrarr;gtrdot;gtreqless;gtreqqless;gtrless;gtrsim;gvertneqq;gvnE;hArr;hairsp;half;hamilt;hardcy;harr;harrcir;harrw;hbar;hcirc;hearts;heartsuit;hellip;hercon;hfr;hksearow;hkswarow;hoarr;homtht;hookleftarrow;hookrightarrow;hopf;horbar;hscr;hslash;hstrok;hybull;hyphen;iacute;ic;icirc;icy;iecy;iexcl;iff;ifr;igrave;ii;iiiint;iiint;iinfin;iiota;ijlig;imacr;image;imagline;imagpart;imath;imof;imped;in;incare;infin;infintie;inodot;int;intcal;integers;intercal;intlarhk;intprod;iocy;iogon;iopf;iota;iprod;iquest;iscr;isin;isinE;isindot;isins;isinsv;isinv;it;itilde;iukcy;iuml;jcirc;jcy;jfr;jmath;jopf;jscr;jsercy;jukcy;kappa;kappav;kcedil;kcy;kfr;kgreen;khcy;kjcy;kopf;kscr;lAarr;lArr;lAtail;lBarr;lE;lEg;lHar;lacute;laemptyv;lagran;lambda;lang;langd;langle;lap;laquo;larr;larrb;larrbfs;larrfs;larrhk;larrlp;larrpl;larrsim;larrtl;lat;latail;late;lates;lbarr;lbbrk;lbrace;lbrack;lbrke;lbrksld;lbrkslu;lcaron;lcedil;lceil;lcub;lcy;ldca;ldquo;ldquor;ldrdhar;ldrushar;ldsh;le;leftarrow;leftarrowtail;leftharpoondown;leftharpoonup;leftleftarrows;leftrightarrow;leftrightarrows;leftrightharpoons;leftrightsquigarrow;leftthreetimes;leg;leq;leqq;leqslant;les;lescc;lesdot;lesdoto;lesdotor;lesg;lesges;lessapprox;lessdot;lesseqgtr;lesseqqgtr;lessgtr;lesssim;lfisht;lfloor;lfr;lg;lgE;lhard;lharu;lharul;lhblk;ljcy;ll;llarr;llcorner;llhard;lltri;lmidot;lmoust;lmoustache;lnE;lnap;lnapprox;lne;lneq;lneqq;lnsim;loang;loarr;lobrk;longleftarrow;longleftrightarrow;longmapsto;longrightarrow;looparrowleft;looparrowright;lopar;lopf;loplus;lotimes;lowast;lowbar;loz;lozenge;lozf;lpar;lparlt;lrarr;lrcorner;lrhar;lrhard;lrm;lrtri;lsaquo;lscr;lsh;lsim;lsime;lsimg;lsqb;lsquo;lsquor;lstrok;lt;ltcc;ltcir;ltdot;lthree;ltimes;ltlarr;ltquest;ltrPar;ltri;ltrie;ltrif;lurdshar;luruhar;lvertneqq;lvnE;mDDot;macr;male;malt;maltese;map;mapsto;mapstodown;mapstoleft;mapstoup;marker;mcomma;mcy;mdash;measuredangle;mfr;mho;micro;mid;midast;midcir;middot;minus;minusb;minusd;minusdu;mlcp;mldr;mnplus;models;mopf;mp;mscr;mstpos;mu;multimap;mumap;nGg;nGt;nGtv;nLeftarrow;nLeftrightarrow;nLl;nLt;nLtv;nRightarrow;nVDash;nVdash;nabla;nacute;nang;nap;napE;napid;napos;napprox;natur;natural;naturals;nbsp;nbump;nbumpe;ncap;ncaron;ncedil;ncong;ncongdot;ncup;ncy;ndash;ne;neArr;nearhk;nearr;nearrow;nedot;nequiv;nesear;nesim;nexist;nexists;nfr;ngE;nge;ngeq;ngeqq;ngeqslant;nges;ngsim;ngt;ngtr;nhArr;nharr;nhpar;ni;nis;nisd;niv;njcy;nlArr;nlE;nlarr;nldr;nle;nleftarrow;nleftrightarrow;nleq;nleqq;nleqslant;nles;nless;nlsim;nlt;nltri;nltrie;nmid;nopf;not;notin;notinE;notindot;notinva;notinvb;notinvc;notni;notniva;notnivb;notnivc;npar;nparallel;nparsl;npart;npolint;npr;nprcue;npre;nprec;npreceq;nrArr;nrarr;nrarrc;nrarrw;nrightarrow;nrtri;nrtrie;nsc;nsccue;nsce;nscr;nshortmid;nshortparallel;nsim;nsime;nsimeq;nsmid;nspar;nsqsube;nsqsupe;nsub;nsubE;nsube;nsubset;nsubseteq;nsubseteqq;nsucc;nsucceq;nsup;nsupE;nsupe;nsupset;nsupseteq;nsupseteqq;ntgl;ntilde;ntlg;ntriangleleft;ntrianglelefteq;ntriangleright;ntrianglerighteq;nu;num;numero;numsp;nvDash;nvHarr;nvap;nvdash;nvge;nvgt;nvinfin;nvlArr;nvle;nvlt;nvltrie;nvrArr;nvrtrie;nvsim;nwArr;nwarhk;nwarr;nwarrow;nwnear;oS;oacute;oast;ocir;ocirc;ocy;odash;odblac;odiv;odot;odsold;oelig;ofcir;ofr;ogon;ograve;ogt;ohbar;ohm;oint;olarr;olcir;olcross;oline;olt;omacr;omega;omicron;omid;ominus;oopf;opar;operp;oplus;or;orarr;ord;order;orderof;ordf;ordm;origof;oror;orslope;orv;oscr;oslash;osol;otilde;otimes;otimesas;ouml;ovbar;par;para;parallel;parsim;parsl;part;pcy;percnt;period;permil;perp;pertenk;pfr;phi;phiv;phmmat;phone;pi;pitchfork;piv;planck;planckh;plankv;plus;plusacir;plusb;pluscir;plusdo;plusdu;pluse;plusmn;plussim;plustwo;pm;pointint;popf;pound;pr;prE;prap;prcue;pre;prec;precapprox;preccurlyeq;preceq;precnapprox;precneqq;precnsim;precsim;prime;primes;prnE;prnap;prnsim;prod;profalar;profline;profsurf;prop;propto;prsim;prurel;pscr;psi;puncsp;qfr;qint;qopf;qprime;qscr;quaternions;quatint;quest;questeq;quot;rAarr;rArr;rAtail;rBarr;rHar;race;racute;radic;raemptyv;rang;rangd;range;rangle;raquo;rarr;rarrap;rarrb;rarrbfs;rarrc;rarrfs;rarrhk;rarrlp;rarrpl;rarrsim;rarrtl;rarrw;ratail;ratio;rationals;rbarr;rbbrk;rbrace;rbrack;rbrke;rbrksld;rbrkslu;rcaron;rcedil;rceil;rcub;rcy;rdca;rdldhar;rdquo;rdquor;rdsh;real;realine;realpart;reals;rect;reg;rfisht;rfloor;rfr;rhard;rharu;rharul;rho;rhov;rightarrow;rightarrowtail;rightharpoondown;rightharpoonup;rightleftarrows;rightleftharpoons;rightrightarrows;rightsquigarrow;rightthreetimes;ring;risingdotseq;rlarr;rlhar;rlm;rmoust;rmoustache;rnmid;roang;roarr;robrk;ropar;ropf;roplus;rotimes;rpar;rpargt;rppolint;rrarr;rsaquo;rscr;rsh;rsqb;rsquo;rsquor;rthree;rtimes;rtri;rtrie;rtrif;rtriltri;ruluhar;rx;sacute;sbquo;sc;scE;scap;scaron;sccue;sce;scedil;scirc;scnE;scnap;scnsim;scpolint;scsim;scy;sdot;sdotb;sdote;seArr;searhk;searr;searrow;sect;semi;seswar;setminus;setmn;sext;sfr;sfrown;sharp;shchcy;shcy;shortmid;shortparallel;shy;sigma;sigmaf;sigmav;sim;simdot;sime;simeq;simg;simgE;siml;simlE;simne;simplus;simrarr;slarr;smallsetminus;smashp;smeparsl;smid;smile;smt;smte;smtes;softcy;sol;solb;solbar;sopf;spades;spadesuit;spar;sqcap;sqcaps;sqcup;sqcups;sqsub;sqsube;sqsubset;sqsubseteq;sqsup;sqsupe;sqsupset;sqsupseteq;squ;square;squarf;squf;srarr;sscr;ssetmn;ssmile;sstarf;star;starf;straightepsilon;straightphi;strns;sub;subE;subdot;sube;subedot;submult;subnE;subne;subplus;subrarr;subset;subseteq;subseteqq;subsetneq;subsetneqq;subsim;subsub;subsup;succ;succapprox;succcurlyeq;succeq;succnapprox;succneqq;succnsim;succsim;sum;sung;sup;sup1;sup2;sup3;supE;supdot;supdsub;supe;supedot;suphsol;suphsub;suplarr;supmult;supnE;supne;supplus;supset;supseteq;supseteqq;supsetneq;supsetneqq;supsim;supsub;supsup;swArr;swarhk;swarr;swarrow;swnwar;szlig;target;tau;tbrk;tcaron;tcedil;tcy;tdot;telrec;tfr;there4;therefore;theta;thetasym;thetav;thickapprox;thicksim;thinsp;thkap;thksim;thorn;tilde;times;timesb;timesbar;timesd;tint;toea;top;topbot;topcir;topf;topfork;tosa;tprime;trade;triangle;triangledown;triangleleft;trianglelefteq;triangleq;triangleright;trianglerighteq;tridot;trie;triminus;triplus;trisb;tritime;trpezium;tscr;tscy;tshcy;tstrok;twixt;twoheadleftarrow;twoheadrightarrow;uArr;uHar;uacute;uarr;ubrcy;ubreve;ucirc;ucy;udarr;udblac;udhar;ufisht;ufr;ugrave;uharl;uharr;uhblk;ulcorn;ulcorner;ulcrop;ultri;umacr;uml;uogon;uopf;uparrow;updownarrow;upharpoonleft;upharpoonright;uplus;upsi;upsih;upsilon;upuparrows;urcorn;urcorner;urcrop;uring;urtri;uscr;utdot;utilde;utri;utrif;uuarr;uuml;uwangle;vArr;vBar;vBarv;vDash;vangrt;varepsilon;varkappa;varnothing;varphi;varpi;varpropto;varr;varrho;varsigma;varsubsetneq;varsubsetneqq;varsupsetneq;varsupsetneqq;vartheta;vartriangleleft;vartriangleright;vcy;vdash;vee;veebar;veeeq;vellip;verbar;vert;vfr;vltri;vnsub;vnsup;vopf;vprop;vrtri;vscr;vsubnE;vsubne;vsupnE;vsupne;vzigzag;wcirc;wedbar;wedge;wedgeq;weierp;wfr;wopf;wp;wr;wreath;wscr;xcap;xcirc;xcup;xdtri;xfr;xhArr;xharr;xi;xlArr;xlarr;xmap;xnis;xodot;xopf;xoplus;xotime;xrArr;xrarr;xscr;xsqcup;xuplus;xutri;xvee;xwedge;yacute;yacy;ycirc;ycy;yen;yfr;yicy;yopf;yscr;yucy;yuml;zacute;zcaron;zcy;zdot;zeetrf;zeta;zfr;zhcy;zigrarr;zopf;zscr;zwj;zwnj;';
// The set above was produced from the standard HTML5 named-character-reference
// list (Python's html.entities.html5, keys ending in ';'). It is used only to
// decide whether "&name;" is a recognised reference.

function isKnownEntity(name) { return ENTITY_NAMES.indexOf(';' + name + ';') >= 0; }

// Decode one entity reference starting at s[i] == '&'. Returns [text, len]
// where text is what the reference renders to (verbatim for named, decoded
// char for numeric), or null when this is not a valid reference at all.
function parseEntity(s, i) {
  const n = s.length;
  if (i + 1 >= n) return null;
  let j = i + 1;
  if (s[j] === '#') {
    j++;
    let hex = false;
    if (j < n && (s[j] === 'x' || s[j] === 'X')) { hex = true; j++; }
    const ds = j;
    while (j < n && (hex ? isHex(s[j]) : isDigit(s[j]))) j++;
    if (j === ds || j >= n || s[j] !== ';') return null;
    const cp = parseInt(s.slice(ds, j), hex ? 16 : 10);
    if (cp > 0x10ffff) return null; // out of range: not a reference at all
    const ch = (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff)) ? '\uFFFD' : String.fromCodePoint(cp);
    return [ch, j + 1 - i, true]; // numeric: decoded char, needs escaping
  }
  if (!isLetter(s[j])) return null;
  const ns = j;
  while (j < n && isAlnum(s[j])) j++;
  if (j >= n || s[j] !== ';') return null;
  const name = s.slice(ns, j);
  if (!isKnownEntity(name)) return [s.slice(i, j + 1), j + 1 - i, false]; // unknown named: kept verbatim
  return [s.slice(i, j + 1), j + 1 - i, false]; // known named: kept verbatim
}

// Escape a string for HTML text/attribute output, entity-aware: a valid
// named reference passes through verbatim, a valid numeric one is decoded
// and then escaped like any other character, anything else after '&' that
// is not a reference is escaped as &amp;.
function escHtml(s) {
  let out = '', start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '&') {
      const e = parseEntity(s, i);
      if (e) {
        if (e[2]) { // numeric: decoded char, escape it
          out += s.slice(start, i) + escChar(e[0]);
        } else { // named: verbatim
          out += s.slice(start, i) + e[0];
        }
        i += e[1] - 1; start = i + 1;
      } else {
        out += s.slice(start, i) + '&amp;'; start = i + 1;
      }
    } else if (c === '<') { out += s.slice(start, i) + '&lt;'; start = i + 1; }
    else if (c === '>') { out += s.slice(start, i) + '&gt;'; start = i + 1; }
    else if (c === '"') { out += s.slice(start, i) + '&quot;'; start = i + 1; }
    else if (c === "'") { out += s.slice(start, i) + '&#39;'; start = i + 1; }
  }
  return out + s.slice(start);
}
function escChar(ch) {
  switch (ch) {
    case '&': return '&amp;'; case '<': return '&lt;'; case '>': return '&gt;';
    case '"': return '&quot;'; case "'": return '&#39;'; default: return ch;
  }
}
// Escape for code content: like escHtml but entities are NOT recognised
// (a '&' in code is always &amp;).
function escCode(s) {
  let out = '', start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '&') { out += s.slice(start, i) + '&amp;'; start = i + 1; }
    else if (c === '<') { out += s.slice(start, i) + '&lt;'; start = i + 1; }
    else if (c === '>') { out += s.slice(start, i) + '&gt;'; start = i + 1; }
    else if (c === '"') { out += s.slice(start, i) + '&quot;'; start = i + 1; }
    else if (c === "'") { out += s.slice(start, i) + '&#39;'; start = i + 1; }
  }
  return out + s.slice(start);
}

// ---------------------------------------------------------------- inline parser
// Node list is a doubly linked list of objects {t,s,ch,dest,title,next,prev}.
// Text nodes hold RAW literal text (escapes/entities resolved as marked does);
// rendering escapes them. Delimiter runs are their own text nodes so emphasis
// processing can split them by character count.

function N(t, s) { return { t: t, s: s || '', ch: null, dest: '', title: '', parent: null }; }

const LINK_LABEL_MAX = 999;

function normalizeLabel(label) {
  // Unicode case folding: ß/ẞ and ligatures fold to their expansions,
  // final sigma folds to sigma, İ folds to i + combining dot.
  return label
    .replace(/\u1E9E|\u00DF/g, 'ss')
    .replace(/\uFB00/g, 'ff').replace(/\uFB01/g, 'fi').replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi').replace(/\uFB04/g, 'ffl').replace(/\uFB05/g, 'st').replace(/\uFB06/g, 'st')
    .replace(/\u03C2/g, '\u03C3')
    .replace(/\u0130/g, 'i\u0307')
    .replace(/[ \t\r\n]+/g, ' ').trim().toLowerCase();
}

// Parse a link label starting at s[i] == '['. Returns {label, end} (end is
// the index just past the closing ']') or null. With `noNest`, the label
// stops at the first ']' (used for reference-definition labels and the
// second label of a full reference, which do not nest).
function scanLinkLabel(s, i, noNest) {
  const n = s.length;
  let j = i + 1, depth = 1;
  while (j < n) {
    const c = s[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '[' && !noNest) { depth++; j++; continue; }
    if (c === ']') {
      if (noNest) {
        const label = s.slice(i + 1, j);
        if (label.length > LINK_LABEL_MAX) return null;
        // A def label may not contain an unescaped '[': in noNest mode
        // any '[' inside is unbalanced (the label ends at the first ']'),
        // so the label (and the def) is invalid (cm-546: `[ref[]: /uri`).
        for (let p = 0; p < label.length; p++) {
          if (label[p] === '\\') { p++; continue; }
          if (label[p] === '[') return null;
        }
        return { label: label, end: j + 1 };
      }
      depth--; j++;
      if (depth === 0) {
        const label = s.slice(i + 1, j - 1);
        if (label.length > LINK_LABEL_MAX) return null;
        return { label: label, end: j };
      }
      continue;
    }
    if (c === '\n' && s[j + 1] === '\n') return null; // no blank line in a label
    if (c < ' ' && c !== '\n' && c !== '\t') return null;
    j++;
  }
  return null;
}

// Skip spaces, tabs and newlines. Returns new index.
function skipWS(s, i) {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++;
  return i;
}

// Parse a link destination starting at s[i]. Returns {dest, end} or null.
// Angle form <...> or bare form (balanced parens, no spaces/control chars).
function scanLinkDest(s, i) {
  const n = s.length;
  if (i >= n) return null;
  if (s[i] === '<') {
    let j = i + 1;
    while (j < n) {
      const c = s[j];
      if (c === '\n' || c === '<') return null;
      if (c === '\\') { j += 2; continue; }
      if (c === '>') return { dest: s.slice(i + 1, j), end: j + 1 };
      j++;
    }
    return null;
  }
  let j = i, depth = 0;
  while (j < n) {
    const c = s[j];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c < ' ') break;
    if (c === '\\') { j += 2; continue; }
    if (c === '(') { depth++; j++; continue; }
    if (c === ')') {
      if (depth === 0) break;
      depth--; j++; continue;
    }
    j++;
  }
  if (depth > 0) return null;
  if (j === i) return { dest: '', end: j };
  return { dest: s.slice(i, j), end: j };
}

// Parse a link title starting at s[i] ('"' or '\'' or '(').
// Returns {title, end} or null. The title may span lines.
function scanLinkTitle(s, i) {
  const n = s.length;
  const q = s[i];
  if (q !== '"' && q !== "'" && q !== '(') return null;
  const close = q === '(' ? ')' : q;
  let j = i + 1;
  while (j < n) {
    const c = s[j];
    if (c === '\\') { j += 2; continue; }
    if (c === close) return { title: s.slice(i + 1, j), end: j + 1 };
    j++;
  }
  return null;
}

// Resolve backslash escapes in a string (used for link destinations/titles).
function resolveBackslashes(s) {
  if (s.indexOf('\\') < 0) return s;
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && i + 1 < s.length && isAsciiPunct(s[i + 1])) { out += s[i + 1]; i += 2; }
    else { out += s[i]; i++; }
  }
  return out;
}

// Parse an inline link "(dest title)" starting at s[i] == '('.
// Returns {dest, title, end} or null.
function parseInlineLink(s, i) {
  const n = s.length;
  let j = skipWS(s, i + 1);
  if (j >= n) return null;
  const d = scanLinkDest(s, j);
  if (!d) return null;
  j = skipWS(s, d.end);
  if (j >= n) return null;
  let title = '';
  if (s[j] === '"' || s[j] === "'" || s[j] === '(') {
    const t = scanLinkTitle(s, j);
    if (!t) return null;
    title = t.title;
    j = skipWS(s, t.end);
    if (j >= n) return null;
  }
  if (s[j] !== ')') return null;
  return { dest: resolveBackslashes(d.dest), title: resolveBackslashes(title), end: j + 1 };
}

// Try to parse an autolink <...> or raw HTML tag at s[i] == '<'.
// Returns {kind:'link', dest, text, end} | {kind:'html', end} | null.
function parseAngle(s, i) {
  const n = s.length;
  // autolink: scheme
  let j = i + 1;
  if (j < n && isLetter(s[j])) {
    let k = j + 1;
    while (k < n && (isAlnum(s[k]) || s[k] === '+' || s[k] === '.' || s[k] === '-')) k++;
    if (k - j >= 2 && k - j <= 32 && k < n && s[k] === ':') {
      let m = k + 1;
      while (m < n && s[m] !== ' ' && s[m] !== '\t' && s[m] !== '\n' && s[m] !== '\r' && s[m] !== '<' && s[m] !== '>' && s[m] >= ' ') m++;
      if (m < n && s[m] === '>') {
        const text = s.slice(i + 1, m);
        return { kind: 'link', dest: text, text: text, end: m + 1 };
      }
    }
  }
  // autolink: email
  {
    let k = i + 1;
    while (k < n && /[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]/.test(s[k])) k++;
    if (k > i + 1 && k < n && s[k] === '@') {
      let m = k + 1;
      while (m < n && /[a-zA-Z0-9.-]/.test(s[m])) m++;
      // domain must be label(.label)+ with each label alnum-led, no trailing '-'
      const dom = s.slice(k + 1, m);
      if (/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(dom) && m < n && s[m] === '>') {
        const text = s.slice(i + 1, m);
        return { kind: 'link', dest: 'mailto:' + text, text: text, end: m + 1 };
      }
    }
  }
  // raw HTML: comment, processing instruction, declaration, CDATA
  if (s.startsWith('<!--', i)) {
    // `<!-->` and `<!--->` are complete comments by themselves.
    if (s.startsWith('<!-->', i)) return { kind: 'html', end: i + 5 };
    if (s.startsWith('<!--->', i)) return { kind: 'html', end: i + 6 };
    let k = i + 4;
    while (k < n) {
      if (s[k] === '-' && s[k + 1] === '-' && s[k + 2] === '>') {
        return { kind: 'html', end: k + 3 };
      }
      k++;
    }
    return null;
  }
  if (s.startsWith('<?', i)) {
    const k = s.indexOf('?>', i + 2);
    return k >= 0 ? { kind: 'html', end: k + 2 } : null;
  }
  if (s.startsWith('<!', i) && i + 2 < n && isLetter(s[i + 2])) {
    let k = i + 2;
    while (k < n && s[k] !== '>') {
      if (s[k] === '\n') return null;
      k++;
    }
    return k < n ? { kind: 'html', end: k + 1 } : null;
  }
  if (s.startsWith('<![CDATA[', i)) {
    const k = s.indexOf(']]>', i + 9);
    return k >= 0 ? { kind: 'html', end: k + 3 } : null;
  }
  // raw HTML: open/close tag
  {
    let k = i + 1;
    let closing = false;
    if (s[k] === '/') { closing = true; k++; }
    if (k >= n || !isLetter(s[k])) return null;
    while (k < n && (isAlnum(s[k]) || s[k] === '-')) k++;
    // The tag name must be followed by whitespace, '/', or '>'.
    if (k < n && s[k] !== ' ' && s[k] !== '\t' && s[k] !== '\n' && s[k] !== '\r' && s[k] !== '/' && s[k] !== '>') return null;
    if (closing) {
      let m = k;
      while (m < n && (s[m] === ' ' || s[m] === '\t' || s[m] === '\n' || s[m] === '\r')) m++;
      if (m < n && s[m] === '>') return { kind: 'html', end: m + 1 };
      return null;
    }
    // attributes: each attribute name must be preceded by whitespace
    while (true) {
      let m = k;
      let hadWS = false;
      while (m < n && (s[m] === ' ' || s[m] === '\t' || s[m] === '\n' || s[m] === '\r')) { m++; hadWS = true; }
      if (m >= n) return null;
      if (s[m] === '>') return { kind: 'html', end: m + 1 };
      if (s[m] === '/' && s[m + 1] === '>') return { kind: 'html', end: m + 2 };
      if (!hadWS) return null;
      if (!isLetter(s[m]) && s[m] !== '_' && s[m] !== ':') return null;
      // attribute name
      while (m < n && (isAlnum(s[m]) || s[m] === '_' || s[m] === ':' || s[m] === '.' || s[m] === '-')) m++;
      let p = m;
      while (p < n && (s[p] === ' ' || s[p] === '\t' || s[p] === '\n' || s[p] === '\r')) p++;
      if (p < n && s[p] === '=') {
        p++;
        while (p < n && (s[p] === ' ' || s[p] === '\t' || s[p] === '\n' || s[p] === '\r')) p++;
        if (p >= n) return null;
        if (s[p] === '"' || s[p] === "'") {
          const q = s[p];
          p++;
          // A newline IS allowed inside a quoted attribute value
          // (cm-642/643: `<a href="foo\nbar">` is a valid tag).
          while (p < n && s[p] !== q) p++;
          if (p >= n) return null;
          p++;
        } else {
          if (p >= n || s[p] === ' ' || s[p] === '\t' || s[p] === '\n' || s[p] === '\r' ||
              s[p] === '"' || s[p] === "'" || s[p] === '=' || s[p] === '<' || s[p] === '>' || s[p] === '`') return null;
          while (p < n && s[p] !== ' ' && s[p] !== '\t' && s[p] !== '\n' && s[p] !== '\r' &&
                 s[p] !== '"' && s[p] !== "'" && s[p] !== '=' && s[p] !== '<' && s[p] !== '>' && s[p] !== '`') p++;
        }
        m = p;
      }
      k = m;
    }
  }
}

// Flanking helpers for emphasis delimiters.
function flanking(s, i, len) {
  // returns {canOpen, canClose} for a delimiter run s[i..i+len)
  const before = i > 0 ? s[i - 1] : '';
  const after = i + len < s.length ? s[i + len] : '';
  const beforeWS = before === '' || isUnicodeSpace(before);
  const afterWS = after === '' || isUnicodeSpace(after);
  const beforePunct = before !== '' && isUnicodePunct(before);
  const afterPunct = after !== '' && isUnicodePunct(after);
  const leftFlanking = !afterWS && (!afterPunct || beforeWS || beforePunct);
  const rightFlanking = !beforeWS && (!beforePunct || afterWS || afterPunct);
  return { leftFlanking, rightFlanking };
}

// --- extended autolinks (GFM) ---
const DOMAIN_LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$/;
function validDomain(dom, minTld) {
  if (!dom || dom.length === 0) return false;
  const parts = dom.split('.');
  if (parts.length < 2) return false;
  for (const p of parts) if (!DOMAIN_LABEL.test(p)) return false;
  if (minTld && parts[parts.length - 1].length < minTld) return false;
  return true;
}
// Scan a www/scheme path starting at i (first path char). Returns end index.
function scanExtPath(s, i) {
  const n = s.length;
  let j = i;
  while (j < n) {
    const c = s[j];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '<' || c === '>' || c === ']' || c < ' ') break;
    // stop before an entity-like &name; (e.g. &hl;)
    if (c === '&') {
      let k = j + 1;
      while (k < n && isAlnum(s[k])) k++;
      if (k > j + 1 && k < n && s[k] === ';') break;
    }
    j++;
  }
  // Trim trailing punctuation and unbalanced ')' until stable: dropping
  // a ')' can expose a '.' (and vice versa), e.g. `...nova).)` must
  // lose the ')', then the '.', then the unbalanced ')' (doc-10/16).
  while (true) {
    while (j > i && '?!.,:;*_~\'"'.indexOf(s[j - 1]) >= 0) j--;
    let open = 0, close = 0;
    for (let k = i; k < j; k++) {
      if (s[k] === '(') open++;
      else if (s[k] === ')') close++;
    }
    if (j > i && s[j - 1] === ')' && close > open) { j--; continue; }
    break;
  }
  return j;
}
// Try a www. autolink at s[i] (s[i..] starts with 'www.'). prevOk: preceding
// char allows an autolink. Returns {text, end} or null.
function tryWww(s, i) {
  const n = s.length;
  let j = i + 4;
  // domain: labels separated by dots
  let k = j;
  while (k < n && (isAlnum(s[k]) || s[k] === '-' || s[k] === '.')) k++;
  let domEnd = k;
  // trim trailing dots
  while (domEnd > j && s[domEnd - 1] === '.') domEnd--;
  const dom = s.slice(j, domEnd);
  if (!validDomain(dom, 2)) return null;
  let end = scanExtPath(s, domEnd);
  if (end === domEnd) end = domEnd; // no path
  return { text: s.slice(i, end), end: end };
}
// Try a scheme autolink (s[i] == ':' and s[i+1..2] == '//'), looking back for
// the scheme start. Returns {text, schemeStart, end} or null.
function trySchemeSlash(s, i) {
  const n = s.length;
  let st = i - 1;
  while (st >= 0 && (isAlnum(s[st]) || s[st] === '+' || s[st] === '.' || s[st] === '-')) st--;
  st++;
  const scheme = s.slice(st, i);
  if (scheme.length < 2 || scheme.length > 32 || !isLetter(scheme[0])) return null;
  let j = i + 3;
  let k = j;
  while (k < n && (isAlnum(s[k]) || s[k] === '-' || s[k] === '.')) k++;
  let domEnd = k;
  while (domEnd > j && s[domEnd - 1] === '.') domEnd--;
  const dom = s.slice(j, domEnd);
  if (!validDomain(dom, 2)) return null;
  const end = scanExtPath(s, domEnd);
  return { text: s.slice(st, end), schemeStart: st, end: end };
}
// Try a scheme:email autolink (s[i] == ':' and not '//'). Returns
// {text, schemeStart, end} or null.
function trySchemeEmail(s, i, isEmCloser) {
  const n = s.length;
  let st = i - 1;
  while (st >= 0 && (isAlnum(s[st]) || s[st] === '+' || s[st] === '.' || s[st] === '-')) st--;
  st++;
  const scheme = s.slice(st, i);
  if (scheme.length < 2 || scheme.length > 32 || !isLetter(scheme[0])) return null;
  const em = tryEmail(s, i + 1, isEmCloser);
  if (!em) return null;
  let end = em.end;
  // optional single path segment /xxx (not containing '/')
  if (end < n && s[end] === '/') {
    let k = end + 1;
    while (k < n && s[k] !== '/' && s[k] !== ' ' && s[k] !== '\t' && s[k] !== '\n' && s[k] !== '\r' && s[k] !== '<' && s[k] !== '>' && s[k] >= ' ') k++;
    // trim trailing punctuation like the ext path does
    let e2 = k;
    while (e2 > end + 1 && '?!.,:;*_~\'"'.indexOf(s[e2 - 1]) >= 0) e2--;
    if (e2 > end + 1) end = e2;
  }
  return { text: s.slice(st, end), schemeStart: st, end: end };
}
// Email domain label: any mix of alphanumerics, '_' and '-', but the
// label must end with an alphanumeric (a lone '_' or '-' is not a label;
// labels may start with '_' or '-', e.g. `foo@bar._com` autolinks).
const EMAIL_LABEL = /^[A-Za-z0-9_-]*[A-Za-z0-9]$/;
function validEmailDomain(dom) {
  if (!dom) return false;
  const parts = dom.split('.');
  if (parts.length < 2) return false;
  for (const p of parts) if (!EMAIL_LABEL.test(p)) return false;
  return true;
}
// Whether the ']' at closeIdx is a valid closer for a link whose text
// starts at `from`: marked's bracket scan toggles "inside a code span"
// on EVERY backtick run (whatever its length), so the ']' only counts
// when the number of backtick runs in the text is even (an odd count
// means the ']' sits inside a code span, e.g. `[a `` x ` y `` b]`)
// — unless the ']' sits immediately after a backtick run (a code span
// closing right before it, e.g. `[a `` x ` y ``]` still links).
// Escaped backticks (`\``) do not count.
function linkTextBracketOK(s, from, to) {
  const first = s.indexOf('`', from);
  if (first < 0 || first >= to) return true;
  let runs = 0;
  let i = from;
  let lastRunEnd = -1;
  while (i < to) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') {
      runs++;
      while (i < to && s[i] === '`') i++;
      lastRunEnd = i;
      continue;
    }
    i++;
  }
  return runs % 2 === 0 || lastRunEnd === to;
}
// For a '[' opener at `openerPos` (text starts at openerPos+cut), find
// the link-text region that marked's bracket scan leaves dead: the scan
// finds no ']' with an even backtick-run count (no valid closer) and the
// FIRST ']' has an odd count and is followed by '('. Returns
// [textStart, bracketPos] or null. No emphasis forms inside such a region.
function deadLinkRegion(s, openerPos, cut) {
  const n = s.length;
  let runs = 0, depth = 1, j = openerPos + cut;
  let firstBracket = -1, firstValid = false, firstParen = false;
  let afterBacktick = false; // the previous chars were a backtick run
  while (j < n) {
    const c = s[j];
    if (c === '\\') { j += 2; afterBacktick = false; continue; }
    if (c === '`') {
      runs++;
      while (j < n && s[j] === '`') j++;
      afterBacktick = true;
      continue;
    }
    if (c === '[' && runs % 2 === 0) { depth++; j++; afterBacktick = false; continue; }
    if (c === ']') {
      const valid = (runs % 2 === 0) || afterBacktick;
      if (firstBracket < 0) {
        firstBracket = j; firstValid = valid;
        firstParen = (s[j + 1] === '(');
      }
      if (valid) {
        depth--;
        if (depth === 0) return null; // a valid closer exists
      }
      j++;
      afterBacktick = false;
      continue;
    }
    j++;
    afterBacktick = false;
  }
  if (firstBracket < 0) return null;
  if (firstValid) return null;
  if (!firstParen) return null;
  return [openerPos + cut, firstBracket];
}
// Try an email autolink starting at s[i] (first char of the local part).
// Returns {text, end} or null. The local part must not start/end with '.'.
// The match is the LONGEST valid email whose following character cannot
// extend it ([A-Za-z0-9_-]); a trailing '_' that closes an earlier
// emphasis run (isEmCloser) still lets the full email match.
function tryEmail(s, i, isEmCloser) {
  const n = s.length;
  let j = i;
  while (j < n && /[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]/.test(s[j])) j++;
  const local = s.slice(i, j);
  if (local.length === 0 || local[0] === '.' || local[local.length - 1] === '.') return null;
  if (j >= n || s[j] !== '@') return null;
  let k = j + 1;
  while (k < n && (isAlnum(s[k]) || s[k] === '.' || s[k] === '-' || s[k] === '_')) k++;
  // Backtrack the domain end over label boundaries until the domain is
  // valid and the following character cannot extend the email.
  let end = k;
  while (end > j + 1) {
    while (end > j + 1 && (s[end - 1] === '.' || s[end - 1] === '_' || s[end - 1] === '-')) end--;
    if (validEmailDomain(s.slice(j + 1, end))) {
      if (end >= n) return { text: s.slice(i, end), end: end };
      const nc = s[end];
      if (!isAlnum(nc) && nc !== '_' && nc !== '-') return { text: s.slice(i, end), end: end };
      if (nc === '_' && isEmCloser && isEmCloser(end)) return { text: s.slice(i, end), end: end };
    }
    const dot = s.lastIndexOf('.', end - 1);
    if (dot <= j) break;
    end = dot;
  }
  return null;
}
function prevAllowsExt(s, i) {
  // char before position i must not be a word char (letter/digit/_)
  if (i === 0) return true;
  const c = s[i - 1];
  return !(isAlnum(c) || c === '_');
}

// Plain-text rendering of an inline node (for link labels and img alt).
function plainTextNode(node) {
  if (node.t === 'text' || node.t === 'code') return node.s;
  if (node.ch) {
    let out = '';
    for (const c of node.ch) out += plainTextNode(c);
    return out;
  }
  return '';
}
function plainTextChildren(ch) {
  let out = '';
  for (const c of ch) out += plainTextNode(c);
  return out;
}
// The next node in flat document order after `node`; containers are units.
function nextFlat(node) {
  let cur = node;
  while (cur.parent) {
    const sibs = cur.parent.ch;
    const idx = sibs.indexOf(cur);
    if (idx + 1 < sibs.length) return sibs[idx + 1];
    cur = cur.parent;
  }
  return null;
}
// Plain text of every node after `node` in flat document order.
function plainTextFrom(node) {
  let out = '';
  let cur = nextFlat(node);
  while (cur) {
    out += plainTextNode(cur);
    cur = nextFlat(cur);
  }
  return out;
}

function renderInlineChildren(ch) {
  let out = '';
  for (const c of ch) out += renderInlineNode(c);
  return out;
}
// Percent-encode a link destination the way marked does (encodeURI, then
// un-encode %25 back to % — marked's cleanUrl does exactly this).
function encodeHref(dest) {
  try { return encodeURI(dest).replace(/%25/g, '%'); } catch (e) { return dest; }
}
function renderInlineNode(node) {
  switch (node.t) {
    case 'text': return escHtml(node.s);
    case 'code': return '<code>' + escCode(node.s) + '</code>';
    case 'emph': return '<em>' + renderInlineChildren(node.ch) + '</em>';
    case 'strong': return '<strong>' + renderInlineChildren(node.ch) + '</strong>';
    case 'del': return '<del>' + renderInlineChildren(node.ch) + '</del>';
    case 'link': {
      let a = '<a href="' + escHtml(encodeHref(node.dest)) + '"';
      if (node.title) a += ' title="' + escHtml(node.title) + '"';
      return a + '>' + renderInlineChildren(node.ch) + '</a>';
    }
    case 'image': {
      let a = '<img src="' + escHtml(encodeHref(node.dest)) + '" alt="' + escHtml(plainTextChildren(node.ch)) + '"';
      if (node.title) a += ' title="' + escHtml(node.title) + '"';
      return a + '>';
    }
    case 'html': return node.s;
    case 'hardbreak': return '<br>';
    default: return '';
  }
}

// The inline parser: string -> HTML fragment (no surrounding <p>).
function parseInline(s, refs) {
  // Fast path: no markdown syntax, no autolink triggers, no hard break.
  if (s.indexOf('www.') < 0 && s.indexOf('://') < 0 && s.indexOf('@') < 0 &&
      s.indexOf('  \n') < 0 && !/[*_`\\[\]!<>~&]/.test(s)) {
    return escHtml(s);
  }
  const n = s.length;
  const head = N('root');
  head.ch = [];
  let canMerge = false; // true iff the last child of head is a text node we may append to
  const delims = [];
  const hasBracket = s.indexOf('[') >= 0;

  // True when the '_' at position p can close an earlier '_' emphasis
  // opener in the current parent (so an email ending just before p
  // still autolinks in full, as marked does inside emphasis).
  function isEmCloserPos(p) {
    if (s[p] !== '_') return false;
    let j = p;
    while (j < n && s[j] === '_') j++;
    const f = flanking(s, p, j - p);
    const canClose = f.rightFlanking && (!f.leftFlanking || (j < n && isUnicodePunct(s[j])));
    if (!canClose) return false;
    for (let d = delims.length - 1; d >= 0; d--) {
      const dd = delims[d];
      if (dd.char === '_' && dd.len > 0 && dd.canOpen && dd.node.parent === head) return true;
    }
    return false;
  }
  // True when source position `pos` lies inside a dead link text
  // (see deadLinkRegion): no emphasis may start there. The '['
  // opener may since have been deactivated by a later link forming;
  // the dead region is a property of the source text, not of the
  // opener's current state (a dead opener can never form a link
  // itself, so it is never removed from `delims`).
  function inDeadRegion(pos) {
    if (!hasBracket) return false;
    for (let d = delims.length - 1; d >= 0; d--) {
      const dd = delims[d];
      if ((dd.char === '[' || dd.char === '![') && dd.pos < pos) {
        if (dd.deadComputed === undefined) {
          dd.deadComputed = true;
          dd.dead = deadLinkRegion(s, dd.pos, dd.char === '![' ? 2 : 1);
        }
        const r = dd.dead;
        if (r && pos >= r[0] && pos <= r[1]) return true;
      }
    }
    return false;
  }
  function lastHeadText() {
    const c = head.ch;
    const last = c.length ? c[c.length - 1] : null;
    return last && last.t === 'text' ? last : null;
  }
  // Remove `expected` from the end of head's trailing text nodes. The text
  // may span several nodes when an emphasis delimiter split it (e.g. the
  // `_` in an email local part). Returns false, without mutating, when a
  // non-text node blocks the way or the text does not match.
  function cutTrailingText(expected) {
    const need = expected.length;
    let remaining = need;
    const nodes = [];
    for (let k = head.ch.length - 1; k >= 0 && remaining > 0; k--) {
      const c = head.ch[k];
      if (c.t !== 'text') return false;
      nodes.push(c);
      remaining -= c.s.length;
    }
    if (remaining > 0) return false;
    let got = '';
    for (let k = nodes.length - 1; k >= 0; k--) got += nodes[k].s;
    if (got.slice(-need) !== expected) return false;
    let rem = need;
    while (rem > 0) {
      const last = head.ch[head.ch.length - 1];
      if (last.s.length > rem) {
        const cut = rem;
        last.s = last.s.slice(0, last.s.length - cut);
        for (let d = delims.length - 1; d >= 0; d--) {
          if (delims[d].node === last) {
            delims[d].len -= cut;
            if (delims[d].len <= 0) delims.splice(d, 1);
          }
        }
        rem = 0;
      } else {
        rem -= last.s.length;
        head.ch.pop();
        for (let d = delims.length - 1; d >= 0; d--) if (delims[d].node === last) delims.splice(d, 1);
      }
    }
    return true;
  }
  function appendNode(node) {
    node.parent = head;
    head.ch.push(node);
    canMerge = node.t === 'text';
  }
  function addText(str) {
    if (!str) return;
    const last = lastHeadText();
    if (canMerge && last) last.s += str;
    else appendNode(N('text', str));
    canMerge = true;
  }
  // Add `str` as its own text node and break merging, so that a literal '&'
  // is never re-read as the start of an entity reference at render time.
  function addTextRaw(str) {
    appendNode(N('text', str));
    canMerge = false;
  }
  function removeNode(node) {
    const p = node.parent;
    if (!p) return;
    const idx = p.ch.indexOf(node);
    if (idx >= 0) p.ch.splice(idx, 1);
    node.parent = null;
  }
  function insertAfter(after, node) {
    const p = after.parent;
    const idx = p.ch.indexOf(after);
    p.ch.splice(idx + 1, 0, node);
    node.parent = p;
  }

  function processEmphasis(closerIdx) {
    let closer = delims[closerIdx];
    if (!closer) return;
    while (closer && closer.len > 0) {
      const ci = delims.indexOf(closer);
      let openerIdx = -1;
      for (let k = ci - 1; k >= 0; k--) {
        const d = delims[k];
        // An active link opener blocks emphasis from spanning across it.
        if ((d.char === '[' || d.char === '![') && d.active) break;
        if (!d.len || d.char !== closer.char) continue;
        if (!d.canOpen) continue;
        if ((d.canOpen && d.canClose) || (closer.canOpen && closer.canClose)) {
          if ((d.len + closer.len) % 3 === 0 && !(d.len % 3 === 0 && closer.len % 3 === 0)) continue;
        }
        // The opener must sit in the same parent as the closer; when it
        // is inside an already-formed node, skip it and keep scanning.
        if (d.node.parent !== closer.node.parent) continue;
        // An opener inside a dead link text never forms emphasis.
        if (d.pos !== undefined && inDeadRegion(d.pos)) continue;
        openerIdx = k; break;
      }
      if (openerIdx < 0) break;
      const opener = delims[openerIdx];
      const use = (opener.len >= 2 && closer.len >= 2) ? 2 : 1;
      const type = closer.char === '~' ? 'del' : (use === 2 ? 'strong' : 'emph');
      const parent = opener.node.parent;
      const arr = parent.ch;
      const oi = arr.indexOf(opener.node);
      const ci2 = arr.indexOf(closer.node);
      if (oi < 0 || ci2 < 0 || oi >= ci2) break;
      const emph = N(type);
      emph.ch = arr.slice(oi + 1, ci2);
      for (const c of emph.ch) c.parent = emph;
      emph.parent = parent;
      opener.node.s = opener.node.s.slice(0, opener.node.s.length - use);
      closer.node.s = closer.node.s.slice(use);
      opener.len -= use; closer.len -= use;
      const mid = [];
      if (opener.node.s !== '') mid.push(opener.node);
      mid.push(emph);
      if (closer.node.s !== '') mid.push(closer.node);
      parent.ch = arr.slice(0, oi).concat(mid, arr.slice(ci2 + 1));
      canMerge = false;
      if (opener.len === 0) delims.splice(openerIdx, 1);
      if (closer.len === 0) {
        const cix = delims.indexOf(closer);
        if (cix >= 0) delims.splice(cix, 1);
        break;
      }
    }
  }

  // Try to form a link/image at the ']' at position closeIdx.
  // Returns the index to continue scanning from, or 0 when no link forms.
  function tryLink(closeIdx) {
    let k = -1;
    for (let d = delims.length - 1; d >= 0; d--) {
      const dd = delims[d];
      if ((dd.char === '[' || dd.char === '![') && dd.active) { k = d; break; }
    }
    if (k < 0) return 0;
    const opener = delims[k];
    const isImg = opener.char === '![';
    const cut = isImg ? 2 : 1;
    // A ']' with an odd number of backtick runs before it sits inside a
    // code span (marked's toggle scan) and is not a link-text closer.
    // The opener stays active: a later ']' may still pair with it.
    if (!linkTextBracketOK(s, opener.pos + cut, closeIdx)) return 0;
    let dest = null, title = '', end = 0;
    if (s[closeIdx + 1] === '(') {
      const il = parseInlineLink(s, closeIdx + 1);
      if (!il) {
        // An inline link that fails falls back to a shortcut reference.
        const label = s.slice(opener.pos + cut, closeIdx);
        const ref = refs.get(normalizeLabel(label));
        if (!ref) { opener.active = false; return 0; }
        dest = ref.dest; title = ref.title; end = closeIdx + 1;
      } else {
        dest = il.dest; title = il.title; end = il.end;
      }
    } else {
      let label = null;
      if (s[closeIdx + 1] === '[') {
        // The SECOND label of a full reference DOES nest-count (cm-547):
        // `[foo][ref[bar]]` has label `ref[bar]`. (Only ref-DEF labels
        // stop at the first `]` — see tryParseDef, cm-546/548/590.)
        const lb = scanLinkLabel(s, closeIdx + 1);
        if (!lb) { opener.active = false; return 0; }
        label = lb.label === '' ? null : lb.label; // '' means collapsed
        end = lb.end;
      } else {
        end = closeIdx + 1;
      }
      if (label === null) {
        // Collapsed or shortcut: the label is the RAW source slice, not
        // the parsed text (escapes must not be resolved for matching).
        label = s.slice(opener.pos + cut, closeIdx);
      }
      const ref = refs.get(normalizeLabel(label));
      if (!ref) { opener.active = false; return 0; }
      dest = ref.dest; title = ref.title;
    }
    // Collect the link text: every node after the opener in flat order.
    const collected = [];
    let cur = nextFlat(opener.node);
    while (cur) {
      collected.push(cur);
      cur = nextFlat(cur);
    }
    // A link's text cannot contain another (top-level) link. This is
    // normally enforced by deactivation, but '[' openers inside an
    // '![' are left active (see below) so they are tried here and
    // must fail when their text already holds a link (cm-520).
    // A GFM autolink inside the text is different: it dissolves to
    // plain text when an outer link forms around it (doc-16).
    if (!isImg) {
      for (const node of collected) {
        if (node.t === 'link' && node.parent === opener.node.parent) {
          if (node.auto) {
            node.t = 'text';
            node.s = plainTextNode(node);
            node.ch = [];
            delete node.dest; delete node.title; delete node.auto;
          } else {
            opener.active = false; return 0;
          }
        }
      }
    }
    for (const node of collected) removeNode(node);
    // form the node
    const node = N(isImg ? 'image' : 'link');
    node.dest = dest; node.title = title;
    node.ch = collected;
    for (const c of collected) c.parent = node;
    // remove delimiters inside the link and the opener itself
    for (let d = delims.length - 1; d >= 0; d--) {
      const dd = delims[d];
      if (dd === opener) { delims.splice(d, 1); continue; }
      if (collected.indexOf(dd.node) >= 0) delims.splice(d, 1);
    }
    // A link deactivates earlier '[' openers (a link cannot contain a
    // link) — but NOT an '[' inside an active '![' (that '[' is part of
    // the image's alt text; it must still be tried — and fail — at a
    // later ']' so the ']' is consumed correctly, cm-520), and never
    // an '![' opener (an image may hold a link in its alt text, cm-575).
    if (!isImg) {
      for (let d = 0; d < delims.length; d++) {
        const dd = delims[d];
        if (dd.char !== '[') continue;
        let insideImg = false;
        for (let e = 0; e < d; e++) {
          if (delims[e].char === '![' && delims[e].active) { insideImg = true; break; }
        }
        if (!insideImg) dd.active = false;
      }
    }
    // remove the '[' / '![' from the opener's text node and insert the link
    // at the opener's position
    const parent = opener.node.parent;
    const arr = parent.ch;
    const oi = arr.indexOf(opener.node);
    opener.node.s = opener.node.s.slice(0, opener.node.s.length - cut);
    if (opener.node.s === '') {
      arr.splice(oi, 1, node);
    } else {
      arr.splice(oi + 1, 0, node);
    }
    node.parent = parent;
    // If the parent lost all other children, drop it and move the link up.
    let p = parent;
    while (p !== head && p.ch.length === 1 && p.ch[0] === node) {
      const gp = p.parent;
      const gi = gp.ch.indexOf(p);
      gp.ch.splice(gi, 1, node);
      node.parent = gp;
      p = gp;
    }
    canMerge = false;
    return end;
  }

  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '\n') {
      // hard break: two or more trailing spaces/tabs before the newline
      const last = lastHeadText();
      if (last) {
        let k = last.s.length;
        while (k > 0 && (last.s[k - 1] === ' ' || last.s[k - 1] === '\t')) k--;
        if (last.s.length - k >= 2) {
          last.s = last.s.slice(0, k);
          if (last.s === '') removeNode(last);
          appendNode(N('hardbreak'));
          i++;
          // the next line's leading whitespace is stripped after a hard break
          while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
          continue;
        }
      }
      addText('\n');
      i++;
      continue;
    }
    if (c === '\\') {
      const d = s[i + 1];
      if (d === '\n') {
        appendNode(N('hardbreak'));
        i += 2;
        while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
        continue;
      }
      if (d !== undefined && isAsciiPunct(d)) {
        if (d === '&') addTextRaw('&');
        else addText(d);
        i += 2;
        continue;
      }
      addText('\\'); i++; continue;
    }
    if (c === '`') {
      let j = i;
      while (j < n && s[j] === '`') j++;
      const run = j - i;
      let k = j, found = -1;
      while (k < n) {
        if (s[k] === '`') {
          let m = k;
          while (m < n && s[m] === '`') m++;
          if (m - k === run) { found = k; break; }
          k = m;
        } else k++;
      }
      if (found < 0) { addText(s.slice(i, j)); i = j; continue; }
      let content = s.slice(j, found);
      // Newlines become spaces first; only then strip one leading and one
      // trailing space (when the result is not all spaces).
      content = content.replace(/\n/g, ' ');
      if (content.length >= 2 && content[0] === ' ' && content[content.length - 1] === ' ' && /[^ ]/.test(content)) {
        content = content.slice(1, -1);
      }
      appendNode(N('code', content));
      i = found + run;
      continue;
    }
    if (c === '*' || c === '_') {
      let j = i;
      while (j < n && s[j] === c) j++;
      const run = j - i;
      const node = N('text', s.slice(i, j));
      appendNode(node);
      canMerge = false; // a delimiter run must not merge with following text
      const f = flanking(s, i, run);
      const d = { char: c, node: node, len: run, pos: i, canOpen: false, canClose: false };
      if (c === '*') { d.canOpen = f.leftFlanking; d.canClose = f.rightFlanking; }
      else {
        d.canOpen = f.leftFlanking && (!f.rightFlanking || (i > 0 && isUnicodePunct(s[i - 1])));
        d.canClose = f.rightFlanking && (!f.leftFlanking || (j < n && isUnicodePunct(s[j])));
      }
      delims.push(d);
      if (d.canClose) processEmphasis(delims.length - 1);
      i = j;
      continue;
    }
    if (c === '~') {
      let j = i;
      while (j < n && s[j] === '~') j++;
      const run = j - i;
      if (run >= 3) { addText(s.slice(i, j)); i = j; continue; }
      const node = N('text', s.slice(i, j));
      appendNode(node);
      canMerge = false; // a delimiter run must not merge with following text
      const f = flanking(s, i, run);
      const d = { char: '~', node: node, len: run, pos: i, canOpen: f.leftFlanking, canClose: f.rightFlanking };
      delims.push(d);
      if (d.canClose) processEmphasis(delims.length - 1);
      i = j;
      continue;
    }
    if (c === '[') {
      const node = N('text', '[');
      appendNode(node);
      canMerge = false; // the '[' must stay its own node for link formation
      delims.push({ char: '[', node: node, active: true, pos: i });
      i++;
      continue;
    }
    if (c === '!' && s[i + 1] === '[') {
      const node = N('text', '![');
      appendNode(node);
      canMerge = false; // the '![' must stay its own node for link formation
      delims.push({ char: '![', node: node, active: true, pos: i });
      i += 2;
      continue;
    }
    if (c === ']') {
      const end = tryLink(i);
      if (end > 0) { i = end; continue; }
      addText(']');
      i++;
      continue;
    }
    if (c === '<') {
      const a = parseAngle(s, i);
      if (a) {
        if (a.kind === 'link') {
          const node = N('link', a.text);
          node.dest = a.dest; node.title = '';
          node.ch = [N('text', a.text)];
          appendNode(node);
        } else {
          appendNode(N('html', s.slice(i, a.end)));
        }
        i = a.end;
        continue;
      }
      addText('<');
      i++;
      continue;
    }
    if (c === '&') {
      const e = parseEntity(s, i);
      if (e) {
        if (e[2] && e[0] === '&') addTextRaw('&'); // decoded '&': never an entity start
        else addText(e[0]);
        i += e[1];
        continue;
      }
      addTextRaw('&');
      i++;
      continue;
    }
    if (c === 'w' && s.startsWith('www.', i) && prevAllowsExt(s, i)) {
      const w = tryWww(s, i);
      if (w) {
        const node = N('link', w.text);
        node.dest = 'http://' + w.text;
        node.auto = true; // GFM autolink: dissolves to text inside a link
        node.ch = [N('text', w.text)];
        appendNode(node);
        i = w.end;
        continue;
      }
    }
    if (c === ':' && s[i + 1] === '/' && s[i + 2] === '/') {
      const sc = trySchemeSlash(s, i);
      const last = lastHeadText();
      if (sc && prevAllowsExt(s, sc.schemeStart) && last &&
          last.s.endsWith(s.slice(sc.schemeStart, i))) {
        last.s = last.s.slice(0, last.s.length - (i - sc.schemeStart));
        if (last.s === '') removeNode(last);
        const node = N('link', sc.text);
        node.dest = sc.text;
        node.auto = true; // GFM autolink: dissolves to text inside a link
        node.ch = [N('text', sc.text)];
        appendNode(node);
        i = sc.end;
        continue;
      }
    } else if (c === ':') {
      const sc = trySchemeEmail(s, i, isEmCloserPos);
      const last = lastHeadText();
      if (sc && prevAllowsExt(s, sc.schemeStart) && last &&
          last.s.endsWith(s.slice(sc.schemeStart, i))) {
        last.s = last.s.slice(0, last.s.length - (i - sc.schemeStart));
        if (last.s === '') removeNode(last);
        const node = N('link', sc.text);
        node.dest = sc.text;
        node.auto = true; // GFM autolink: dissolves to text inside a link
        node.ch = [N('text', sc.text)];
        appendNode(node);
        i = sc.end;
        continue;
      }
    }
    if (c === '@') {
      let st = i - 1;
      while (st >= 0 && /[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]/.test(s[st])) st--;
      st++;
      // If the first char of the would-be local part is escaped (`\+`),
      // it is not a real local-part char: no autolink (cm-606).
      if (st < i && prevAllowsExt(s, st) && s[st - 1] !== '\\') {
        const em = tryEmail(s, st, isEmCloserPos);
        if (em && em.end > i && cutTrailingText(s.slice(st, i))) {
          const node = N('link', em.text);
          node.dest = 'mailto:' + em.text;
          node.auto = true; // GFM autolink: dissolves to text inside a link
          node.ch = [N('text', em.text)];
          appendNode(node);
          i = em.end;
          continue;
        }
      }
    }
    addText(c);
    i++;
  }
  // Re-run emphasis for closers that were blocked inline by a '['
  // opener which has since failed to form a link (now deactivated) or
  // formed one (now removed). A closer inside a formed link is kept
  // out by the same-parent check in processEmphasis (cm-523).
  const closers = delims.filter(function (d) {
    return (d.char === '*' || d.char === '_' || d.char === '~') && d.canClose && d.len > 0;
  });
  for (let q = closers.length - 1; q >= 0; q--) {
    const idx = delims.indexOf(closers[q]);
    if (idx >= 0 && closers[q].len > 0) processEmphasis(idx);
  }
  return renderInlineChildren(head.ch);
}

// ---------------------------------------------------------------- block parser

// A cursor over one line, tracking visual columns and partially consumed tabs.
function Cursor(s) {
  this.s = s; this.pos = 0; this.col = 0; this.pend = 0;
}
Cursor.prototype.save = function () { return { pos: this.pos, col: this.col, pend: this.pend }; };
Cursor.prototype.restore = function (st) { this.pos = st.pos; this.col = st.col; this.pend = st.pend; };
Cursor.prototype.cur = function () {
  if (this.pend > 0) return ' ';
  return this.pos < this.s.length ? this.s[this.pos] : '';
};
Cursor.prototype.adv = function () {
  if (this.pend > 0) { this.pend--; this.col++; if (this.pend === 0) this.pos++; }
  else if (this.pos < this.s.length) {
    if (this.s[this.pos] === '\t') { this.col += 4 - (this.col % 4); this.pos++; }
    else { this.col++; this.pos++; }
  }
};
// Consume n columns of indentation; false when a non-space is met first.
Cursor.prototype.advCols = function (n) {
  while (n > 0) {
    const c = this.cur();
    if (c === ' ') { this.adv(); n--; }
    else if (c === '\t') {
      const w = 4 - (this.col % 4);
      if (w <= n) { this.adv(); n -= w; }
      else { this.pend = w - n; this.col += n; n = 0; }
    } else return false;
  }
  return true;
};
// Advance the cursor to the absolute column `target`, consuming only
// spaces/tabs; false when a non-space is met first.
Cursor.prototype.advToCol = function (target) {
  while (this.col < target) {
    const c = this.cur();
    if (c === ' ') this.adv();
    else if (c === '\t') {
      const w = 4 - (this.col % 4);
      if (this.col + w <= target) this.adv();
      else { this.pend = (this.col + w) - target; this.col = target; }
    } else return false;
  }
  return true;
};
// Consume up to max columns of spaces/tabs; returns columns consumed.
Cursor.prototype.skipIndent = function (max) {
  let cols = 0;
  while (cols < max) {
    const c = this.cur();
    if (c === ' ') { this.adv(); cols++; }
    else if (c === '\t') {
      const w = 4 - (this.col % 4);
      if (cols + w <= max) { this.adv(); cols += w; }
      else { this.pend = w - (max - cols); this.col += (max - cols); cols = max; }
    } else break;
  }
  return cols;
};
Cursor.prototype.rest = function () {
  if (this.pend > 0) return ' '.repeat(this.pend) + this.s.slice(this.pos + 1);
  return this.s.slice(this.pos);
};
// Remove up to n leading whitespace characters (space or tab), each
// counting as one; a tab is consumed whole (no partial expansion).
// Column advances by the tab width for tabs (via adv()).
Cursor.prototype.stripChars = function (n) {
  while (n > 0) {
    const c = this.cur();
    if (c === ' ' || c === '\t') { this.adv(); n--; }
    else break;
  }
};
Cursor.prototype.blank = function () {
  let p = this.pend > 0 ? this.pos + 1 : this.pos;
  while (p < this.s.length) {
    if (this.s[p] !== ' ' && this.s[p] !== '\t') return false;
    p++;
  }
  return true;
};
// Expand leading tabs in `s` to spaces, with tab stops every 4 columns
// starting from column `col`. Only the leading whitespace run is expanded;
// a tab after non-whitespace is kept as-is.
function expandLeadingTabs(s, col) {
  let i = 0;
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
  let hasTab = false;
  for (let k = 0; k < i; k++) if (s[k] === '\t') { hasTab = true; break; }
  if (!hasTab) return s;
  let out = '', c = col;
  for (let k = 0; k < i; k++) {
    if (s[k] === ' ') { out += ' '; c++; }
    else { const w = 4 - (c % 4); out += ' '.repeat(w); c += w; }
  }
  return out + s.slice(i);
}
// For a paragraph continuation line directly inside a list item: if the
// leading whitespace is >= 4 columns, strip 4 columns (tab-aware, a
// partially consumed tab leaves spaces), then expand any remaining
// leading tabs to spaces. `startCol` is the absolute column of s[0].
function stripItemParaIndent(s, startCol) {
  let col = startCol, i = 0;
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) {
    if (s[i] === '\t') col += 4 - (col % 4); else col++;
    i++;
  }
  const leadCols = col - startCol;
  let out = '', k = 0;
  col = startCol;
  if (leadCols >= 4) {
    let n = 4;
    while (n > 0 && k < s.length) {
      if (s[k] === ' ') { k++; col++; n--; }
      else if (s[k] === '\t') {
        const w = 4 - (col % 4);
        if (w <= n) { k++; col += w; n -= w; }
        else { out += ' '.repeat(w - n); col += n; n = 0; k++; }
      } else break;
    }
  }
  return out + expandLeadingTabs(s.slice(k), col);
}

// Block node factory.
function B(t) { return { t: t, ch: [], lines: null, dead: false }; }

const BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param section source summary table tbody td tfoot th thead title tr track ul').split(' '));

// --- block-start matchers (each: non-consuming on failure, consuming on success) ---
function tryAtx(cur) {
  const save = cur.save();
  cur.skipIndent(3);
  let level = 0;
  while (level < 6 && cur.cur() === '#') { cur.adv(); level++; }
  if (level === 0 || level > 6) { cur.restore(save); return null; }
  const c = cur.cur();
  if (c !== '' && c !== ' ' && c !== '\t') { cur.restore(save); return null; }
  cur.skipIndent(100);
  let text = cur.rest();
  // strip trailing closing sequence: spaces + #'s + spaces at end; the
  // whole text may itself be the closing sequence (a space followed the
  // opening hashes)
  text = text.replace(/^(.*?)[ \t]+#+[ \t]*$/, '$1');
  if (/^#+[ \t]*$/.test(text)) text = '';
  text = text.replace(/[ \t]+$/, '');
  return { level: level, text: text };
}
function tryFence(cur) {
  const save = cur.save();
  cur.skipIndent(3);
  const indent = cur.col;
  const ch = cur.cur();
  if (ch !== '`' && ch !== '~') { cur.restore(save); return null; }
  let len = 0;
  while (cur.cur() === ch) { cur.adv(); len++; }
  if (len < 3) { cur.restore(save); return null; }
  const info = cur.rest();
  if (ch === '`' && info.indexOf('`') >= 0) { cur.restore(save); return null; }
  return { ch: ch, len: len, info: info.trim(), indent: indent };
}
function isClosingFence(cur, fch, flen) {
  const save = cur.save();
  cur.skipIndent(3);
  if (cur.cur() !== fch) { cur.restore(save); return false; }
  let len = 0;
  while (cur.cur() === fch) { cur.adv(); len++; }
  if (len < flen) { cur.restore(save); return false; }
  if (!cur.blank()) { cur.restore(save); return false; }
  return true;
}
// HTML block start. Returns {type} (1..7) or null. `inPara` false for type 7.
function tryHtml(cur, inPara) {
  const save = cur.save();
  cur.skipIndent(3);
  const rest = cur.rest();
  const low = rest.toLowerCase();
  let type = 0;
  // A type-1 start tag may end its first line right after the tag name.
  if (/^<(script|pre|style|textarea)(?:[ \t>]|$)/i.test(rest)) type = 1;
  else if (low.startsWith('<!--')) type = 2;
  else if (low.startsWith('<?')) type = 3;
  else if (/^<![a-z]/i.test(rest)) type = 4;
  else if (low.startsWith('<![cdata[')) type = 5;
  else {
    const m = /^<(?:!--|\?|!\[CDATA\[|![A-Za-z]|\/?[A-Za-z][A-Za-z0-9-]*(?:[ \t]+|\/?>|>))/i.exec(rest);
    if (!m) { cur.restore(save); return null; }
    const tm = /^<\/?([a-z][a-z0-9-]*)/i.exec(rest);
    if (!tm) { cur.restore(save); return null; }
    const after = rest[tm[0].length];
    if (after !== undefined && after !== ' ' && after !== '\t' && after !== '>' && after !== '/') { cur.restore(save); return null; }
    type = BLOCK_TAGS.has(tm[1].toLowerCase()) ? 6 : 7;
  }
  if (type === 7 && inPara) { cur.restore(save); return null; }
  if (type === 7) {
    // A type-7 block is a single complete tag alone on the line.
    const tag = parseAngle(rest, 0);
    if (!tag || tag.kind !== 'html') { cur.restore(save); return null; }
    if (rest.slice(tag.end).trim() !== '') { cur.restore(save); return null; }
  }
  return { type: type };
}
// HTML block end test for a line (full line content after container markers).
function htmlBlockEnds(type, line) {
  const low = line.toLowerCase();
  switch (type) {
    case 1: return /<\/(script|pre|style|textarea)/i.test(line);
    case 2: return line.indexOf('-->') >= 0;
    case 3: return line.indexOf('?>') >= 0;
    case 4: return line.indexOf('>') >= 0;
    case 5: return line.indexOf(']]>') >= 0;
    default: return false;
  }
}
function tryHr(cur) {
  const save = cur.save();
  cur.skipIndent(3);
  const ch = cur.cur();
  if (ch !== '*' && ch !== '-' && ch !== '_') { cur.restore(save); return null; }
  let count = 0;
  while (true) {
    if (cur.cur() === ch) { cur.adv(); count++; }
    else if (cur.cur() === ' ' || cur.cur() === '\t') cur.adv();
    else break;
  }
  if (count >= 3 && cur.blank()) return { ch: ch };
  cur.restore(save);
  return null;
}
function tryQuote(cur) {
  const save = cur.save();
  cur.skipIndent(3);
  if (cur.cur() !== '>') { cur.restore(save); return null; }
  cur.adv();
  if (cur.cur() === ' ') cur.adv();
  else if (cur.cur() === '\t') cur.advCols(1);
  return {};
}
function trySetext(cur) {
  const save = cur.save();
  cur.skipIndent(3);
  const ch = cur.cur();
  if (ch !== '=' && ch !== '-') { cur.restore(save); return null; }
  while (cur.cur() === ch) cur.adv();
  if (!cur.blank()) { cur.restore(save); return null; }
  return { level: ch === '=' ? 1 : 2 };
}
// List marker match (peek). Returns null or
// {bullet, marker, delim, start, width, contentIndent, empty}.
// `contentIndent` is the column (relative to the cursor's current column)
// where the item's content starts; `empty` when nothing follows the marker.
function tryList(cur) {
  const save = cur.save();
  const baseCol = cur.col;
  cur.skipIndent(3);
  const startCol = cur.col;
  const c = cur.cur();
  let bullet = false, delim = '', start = 1, marker = '';
  if (c === '-' || c === '+' || c === '*') {
    bullet = true; marker = c; cur.adv();
  } else if (isDigit(c)) {
    let num = '';
    while (isDigit(cur.cur()) && num.length < 10) { num += cur.cur(); cur.adv(); }
    if (num.length === 0 || num.length > 9) { cur.restore(save); return null; }
    const n = Number(num);
    if (n > 999999999) { cur.restore(save); return null; }
    const d = cur.cur();
    if (d !== '.' && d !== ')') { cur.restore(save); return null; }
    delim = d; start = n; marker = num + d; cur.adv();
  } else { cur.restore(save); return null; }
  const markerWidth = cur.col - startCol;
  const after = cur.cur();
  if (after !== ' ' && after !== '\t' && after !== '') { cur.restore(save); return null; }
  if (after === '') {
    // empty item: content indent is marker width + 1
    return { bullet: bullet, marker: marker, delim: delim, start: start, width: markerWidth, contentIndent: (startCol - baseCol) + markerWidth + 1, empty: true };
  }
  // Count the whitespace columns after the marker (a tab counts at full
  // width). 5+ columns means the content indent is marker width + 1.
  let spaces = 0;
  const s2 = cur.save();
  while (true) {
    const cc = cur.cur();
    if (cc === ' ') { cur.adv(); spaces++; }
    else if (cc === '\t') { const w = 4 - (cur.col % 4); cur.adv(); spaces += w; }
    else break;
  }
  if (spaces === 0) { cur.restore(save); return null; }
  if (cur.blank()) {
    // marker followed only by spaces: empty item
    cur.restore(s2);
    return { bullet: bullet, marker: marker, delim: delim, start: start, width: markerWidth, contentIndent: (startCol - baseCol) + markerWidth + 1, empty: true };
  }
  let contentIndent;
  if (spaces >= 5) {
    // 5+ spaces: content indent is marker width + 1, extra spaces are content
    cur.restore(s2);
    cur.advCols(1);
    contentIndent = (startCol - baseCol) + markerWidth + 1;
  } else {
    contentIndent = (startCol - baseCol) + markerWidth + spaces;
  }
  return { bullet: bullet, marker: marker, delim: delim, start: start, width: markerWidth, contentIndent: contentIndent, empty: false };
}
function tryIndentedCode(cur) {
  const save = cur.save();
  if (!cur.advCols(4)) { cur.restore(save); return null; }
  return {};
}

// --- tables (GFM) ---
// Split a table row line into cells. Respects code spans and \| escapes.
function splitTableRow(line) {
  const cells = [];
  let cur = '', i = 0;
  const n = line.length;
  while (i < n) {
    const c = line[i];
    if (c === '\\' && i + 1 < n) { cur += c + line[i + 1]; i += 2; continue; }
    if (c === '`') {
      let j = i;
      while (j < n && line[j] === '`') j++;
      const run = j - i;
      let k = j, found = -1;
      while (k < n) {
        if (line[k] === '`') {
          let m = k;
          while (m < n && line[m] === '`') m++;
          if (m - k === run) { found = k; break; }
          k = m;
        } else k++;
      }
      if (found < 0) { cur += line.slice(i, j); i = j; continue; }
      cur += line.slice(i, found + run);
      i = found + run;
      continue;
    }
    if (c === '|') { cells.push(cur); cur = ''; i++; continue; }
    cur += c; i++;
  }
  cells.push(cur);
  // Optional outer pipes do not create cells. A leading pipe may follow
  // leading whitespace (` |  | from string | ...`, doc-03), and a
  // trailing pipe may precede trailing whitespace.
  let lead = 0;
  while (lead < line.length && (line[lead] === ' ' || line[lead] === '\t')) lead++;
  if (lead < line.length && line[lead] === '|') cells.shift();
  let end = line.length - 1;
  while (end >= 0 && (line[end] === ' ' || line[end] === '\t')) end--;
  if (end >= 0 && line[end] === '|' && cells.length > 0) cells.pop();
  return cells.map(function (cell) { return cell.replace(/\\\|/g, '|').replace(/^[ \t]+|[ \t]+$/g, ''); });
}
// Parse a delimiter row. Returns {align} (array of 'left'|'center'|'right'|null)
// or null when the line is not a delimiter row.
function parseTableDelimiter(cur) {
  const save = cur.save();
  cur.skipIndent(3);
  const line = cur.rest();
  cur.restore(save);
  // A delimiter row indented 4+ spaces is not a delimiter at all.
  if (line.startsWith(' ') || line.startsWith('\t')) return null;
  if (line.indexOf('-') < 0) return null;
  const cells = splitTableRow(line);
  if (cells.length === 0) return null;
  const align = [];
  for (const cell of cells) {
    const m = /^(:?)-+(:?)$/.exec(cell);
    if (!m) return null;
    align.push(m[1] === ':' && m[2] === ':' ? 'center' : m[1] === ':' ? 'left' : m[2] === ':' ? 'right' : null);
  }
  return { align: align };
}

// --- link reference definitions ---
function skipSpaces(text, i) {
  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
  return i;
}
function skipSpacesOneNL(text, i) {
  i = skipSpaces(text, i);
  if (text[i] === '\n') i = skipSpaces(text, i + 1);
  return i;
}
// Try to parse one link reference definition at the start of `text`
// (the join of candidate lines). Returns {label, dest, title, lines}
// on success, 'incomplete' when the text ends while a valid definition
// could still be completed by a later line, or null when invalid.
function tryParseDef(text, isFinal) {
  let i = 0, col = 0;
  while (i < text.length && text[i] === ' ') { col++; i++; if (col > 3) return null; }
  if (i < text.length && text[i] === '\t') return null;
  if (text[i] !== '[') return null;
  // label (may span lines); unclosed at end of text -> incomplete.
  // Reference-definition labels do not nest: stop at the first ']'.
  const lb = scanLinkLabel(text, i, true);
  if (!lb) {
    // distinguish "unclosed at end" from "invalid"
    let j = i + 1, depth = 1, bad = false;
    while (j < text.length) {
      const c = text[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '[') { depth++; j++; continue; }
      if (c === ']') { depth--; j++; if (depth === 0) break; continue; }
      if (c === '\n' && text[j + 1] === '\n') { bad = true; break; }
      if (c < ' ' && c !== '\n' && c !== '\t') { bad = true; break; }
      j++;
    }
    if (!bad && j >= text.length) return 'incomplete';
    return null;
  }
  const label = normalizeLabel(lb.label);
  if (label === '') return null;
  i = lb.end;
  if (text[i] !== ':') return null;
  i++;
  i = skipSpacesOneNL(text, i);
  if (i >= text.length) return 'incomplete';
  const d = scanLinkDest(text, i);
  if (!d) return null;
  const dest = resolveBackslashes(d.dest);
  let title = '';
  let j = skipSpaces(text, d.end);
  if (text[j] === '\n') {
    const k = skipSpaces(text, j + 1);
    if (text[k] === '"' || text[k] === "'" || text[k] === '(') {
      const t = scanLinkTitle(text, k);
      if (!t) return 'incomplete';
      const tj = skipSpaces(text, t.end);
      if (tj < text.length && text[tj] !== '\n') {
        // Title has trailing junk: the title is not part of the def;
        // the def ends at the destination (j stays at the newline),
        // and the title line becomes paragraph text (cm-210).
      } else {
        title = resolveBackslashes(t.title);
        j = tj;
      }
    } else {
      j = j; // definition ends at the newline
    }
  } else if (text[j] === '"' || text[j] === "'" || text[j] === '(') {
    // A title must be separated from the destination by whitespace.
    if (j === d.end) return null;
    const t = scanLinkTitle(text, j);
    if (!t) return 'incomplete';
    title = resolveBackslashes(t.title);
    j = skipSpaces(text, t.end);
    if (j < text.length && text[j] !== '\n') return null;
  } else if (j >= text.length) {
    // Ends here — but a title may still follow on the next line, so when
    // more lines may arrive (incremental parse) report incomplete and let
    // the caller retry with the longer text (cm-193/195/217). At finalize
    // (isFinal) there is no next line, so this is a complete def.
    if (!isFinal) return 'incomplete';
  } else {
    return null;
  }
  let lines = 1;
  for (let k = 0; k < j; k++) if (text[k] === '\n') lines++;
  return { label: label, dest: dest, title: title, lines: lines };
}
// Parse as many complete definitions as possible from the front of `lines`.
// Returns {defs, consumed, rest, incomplete} where `incomplete` is true when
// the remaining lines could still become a definition with more lines.
function parseDefs(lines, isFinal) {
  const defs = [];
  let i = 0;
  let incomplete = false;
  while (i < lines.length) {
    const text = lines.slice(i).join('\n');
    const r = tryParseDef(text, isFinal);
    if (r === 'incomplete') { incomplete = true; break; }
    if (!r) break;
    defs.push(r);
    i += r.lines;
  }
  return { defs: defs, consumed: i, rest: lines.slice(i), incomplete: incomplete };
}

// ---------------------------------------------------------------- main loop

function parseBlocks(src) {
  const rawLines = src.split('\n');
  const endsNL = src.endsWith('\n');
  if (endsNL) rawLines.pop();
  const lines = rawLines.map(function (s, idx) {
    return { s: s, nl: idx < rawLines.length - 1 || endsNL };
  });
  const doc = B('doc');
  const refs = new Map();
  const open = [doc];
  let blankItem = null; // innermost open item that saw a blank line

  function tip() { return open[open.length - 1]; }
  function addChild(parent, node) {
    node.parent = parent;
    parent.ch.push(node);
    return node;
  }
  function removeFromParent(node) {
    const p = node.parent;
    if (p) { p.ch.pop(); node.parent = null; }
  }
  function innermostItem() {
    for (let i = open.length - 1; i >= 0; i--) if (open[i].t === 'item') return open[i];
    return null;
  }
  function isAncestorOf(anc, node) {
    let p = node;
    while (p) { if (p === anc) return true; p = p.parent; }
    return false;
  }
  function finalize(b) {
    if (b.t === 'para') {
      if (b.defLines.length > 0) {
        const r = parseDefs(b.defLines, true);
        for (const d of r.defs) if (!refs.has(d.label)) refs.set(d.label, { dest: d.dest, title: d.title });
        if (r.rest.length > 0) b.lines.push.apply(b.lines, r.rest);
        b.defLines = [];
      }
      if (b.lines.length === 0) b.dead = true;
    } else if (b.t === 'code') {
      if (!b.fenced) {
        while (b.lines.length > 0 && b.lines[b.lines.length - 1].s === '') b.lines.pop();
      }
      let lit = b.lines.map(function (l) { return l.s + (l.nl ? '\n' : ''); }).join('');
      if (b.fenced && b.closedByFence) {
        // A fence-closed block drops one trailing newline, then gains one
        // back when the content is non-empty.
        if (lit.endsWith('\n')) lit = lit.slice(0, -1);
        if (lit.length > 0 && !lit.endsWith('\n')) lit += '\n';
      }
      b.literal = lit;
    } else if (b.t === 'html') {
      let lit = b.lines.map(function (l) { return l.s + (l.nl ? '\n' : ''); }).join('');
      // Trailing-newline strip: type 6 strips unless the block runs to
      // EOF; types 1-5/7 strip iff the next source line is blank.
      if (lit.endsWith('\n')) {
        if (b.htmlType === 6) {
          if (b.lastLine !== undefined && b.lastLine < lines.length - 1) lit = lit.slice(0, -1);
        } else {
          const next = lines[b.lastLine + 1];
          if (next && next.s.trim() === '') lit = lit.slice(0, -1);
        }
      }
      b.literal = lit;
    }
  }
  function closeBlocksBelow(ci) {
    while (open.length - 1 > ci) finalize(open.pop());
  }
  function addParaLine(para, lineText) {
    if (para.allDefs) {
      const cand = para.defLines.concat([lineText]);
      const r = parseDefs(cand);
      for (const d of r.defs) if (!refs.has(d.label)) refs.set(d.label, { dest: d.dest, title: d.title });
      if (r.rest.length === 0) {
        para.defLines = r.incomplete ? cand : [];
        return;
      }
      if (r.incomplete) { para.defLines = cand; return; }
      para.allDefs = false;
      para.lines = r.rest.slice();
      para.defLines = [];
      return;
    }
    para.lines.push(lineText);
  }
  function matchListPeek(cur, list) {
    const save = cur.save();
    const m = tryList(cur);
    cur.restore(save);
    if (!m) return null;
    if (list.bullet !== m.bullet) return null;
    if (list.bullet && list.marker !== m.marker) return null;
    if (!list.bullet && list.delim !== m.delim) return null;
    return m;
  }
  function listCanInterrupt(lm, tp) {
    if (tp.t !== 'para') return true;
    // An empty list marker cannot interrupt a paragraph.
    if (lm.empty) return false;
    // A paragraph that is a direct child of a list item may be
    // interrupted by an ordered list with any start number (marked
    // behaviour; at top level or inside a blockquote the spec rule
    // applies: bullet lists, or ordered lists starting at 1).
    if (tp.parent && tp.parent.t === 'item') return true;
    return lm.bullet || lm.start === 1;
  }
  // True when the line is a list marker at (or above) the level of an
  // enclosing list of the paragraph. Such a marker ends the list item and
  // starts a new list, even when it could not interrupt a paragraph at
  // document level (e.g. an ordered list not starting at 1).
  function isOuterListMarker(cur, tp, ci) {
    const save = cur.save();
    const lm = tryList(cur);
    cur.restore(save);
    if (!lm) return false;
    let p = tp.parent, outerList = null;
    while (p) { if (p.t === 'list') outerList = p; p = p.parent; }
    if (!outerList) return false;
    const idx = open.indexOf(outerList);
    return idx >= 0 && idx >= ci;
  }
  function startsNewBlock(cur, tp, forTable, inParaContainer) {
    const save = cur.save();
    let hit = false;
    // A setext/table line only starts a new block when it lies inside the
    // paragraph's own container; outside it, the line is paragraph text
    // (a lazy continuation).
    if (inParaContainer !== false && tp.t === 'para' && tp.lines.length > 0) {
      if (trySetext(cur)) hit = true;
      else if (tp.lines.length === 1) {
        const td = parseTableDelimiter(cur);
        // A delimiter row only starts a table when its cell count matches
        // the header row; otherwise the line is paragraph text.
        if (td && splitTableRow(tp.lines[0]).length === td.align.length) hit = true;
      }
    }
    if (!hit) {
      const lm = tryList(cur);
      hit = !!(tryAtx(cur) || tryFence(cur) || tryHtml(cur, tp.t === 'para') || tryHr(cur) || tryQuote(cur) ||
        (lm && listCanInterrupt(lm, tp)) || (!forTable && tp.t !== 'para' && tryIndentedCode(cur)));
    }
    cur.restore(save);
    return hit;
  }
  // When a new block is created, a pending blank line may make a list loose.
  function noteBlockStart(newParent) {
    if (!blankItem) return;
    const list = blankItem.parent;
    if (!list || list.t !== 'list') { blankItem = null; return; }
    if (newParent === list || isAncestorOf(blankItem, newParent)) {
      list.tight = false;
    }
    // If the new block starts in an ANCESTOR item of the blank item, the
    // blank separates two blocks of that ancestor item (e.g. a nested
    // list and a following paragraph in the same outer item, cm-325):
    // loosen the ancestor item's list.
    if (newParent.t === 'item' && isAncestorOf(newParent, blankItem)) {
      const plist = newParent.parent;
      if (plist && plist.t === 'list') plist.tight = false;
    }
    blankItem = null;
  }
  function newPara(container, lineText) {
    const para = B('para');
    para.lines = []; para.defLines = []; para.allDefs = true;
    addChild(container, para);
    open.push(para);
    addParaLine(para, lineText);
    return para;
  }

  function startBlocks(container, cur) {
    let cont = container;
    // A non-list block ends an open list (e.g. a thematic break whose line
    // also matches the list's item pattern): close the list and use its
    // parent as the container for the new block.
    function blockParent() {
      const t = tip();
      if (t.t === 'list') {
        const parent = t.parent;
        closeBlocksBelow(open.indexOf(t) - 1);
        cont = parent;
      }
      return cont;
    }
    while (true) {
      const tp = tip();
      // setext heading / table (only when the tip is a paragraph with text)
      if (tp.t === 'para' && tp.lines.length > 0) {
        const st = trySetext(cur);
        if (st) {
          const para = open.pop();
          removeFromParent(para);
          const h = B('heading');
          h.level = st.level;
          h.text = para.lines.join('\n').replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
          addChild(cont, h);
          return;
        }
        if (tp.lines.length === 1) {
          const td = parseTableDelimiter(cur);
          if (td) {
            const headCells = splitTableRow(tp.lines[0]);
            if (headCells.length === td.align.length) {
              const para = open.pop();
              removeFromParent(para);
              const tb = B('table');
              tb.align = td.align; tb.head = headCells; tb.rows = [];
              addChild(cont, tb);
              open.push(tb);
              return;
            }
            // cell count mismatch: not a table; fall through to paragraph text
          }
        }
      }
      const atx = tryAtx(cur);
      if (atx) {
        const h = B('heading');
        h.level = atx.level; h.text = atx.text;
        const c = blockParent();
        noteBlockStart(c);
        addChild(c, h);
        return;
      }
      const baseCol = cur.col;
      const fence = tryFence(cur);
      if (fence) {
        const code = B('code');
        code.fenced = true; code.fenceCh = fence.ch; code.fenceLen = fence.len; code.info = fence.info; code.lines = [];
        code.fenceIndent = fence.indent - baseCol;
        const c = blockParent();
        noteBlockStart(c);
        addChild(c, code);
        open.push(code);
        return;
      }
      // Capture the line BEFORE tryHtml: its skipIndent(3) consumes the
      // leading spaces (up to 3), but the html block's literal keeps them
      // (cm-150/183/184: ` <div>`, `  <!-- foo -->` keep their indent).
      const htmlLine = cur.rest();
      const html = tryHtml(cur, tp.t === 'para');
      if (html) {
        const hb = B('html');
        hb.htmlType = html.type; hb.lines = [{ s: htmlLine, nl: curLine.nl }]; hb.lastLine = li;
        const c = blockParent();
        noteBlockStart(c);
        addChild(c, hb);
        // A type 1-5 block whose end tag is already on its first line is
        // complete at once and never goes on the open stack.
        if (html.type <= 5 && htmlBlockEnds(html.type, htmlLine)) {
          finalize(hb);
        } else {
          open.push(hb);
        }
        return;
      }
      if (tryHr(cur)) {
        const c = blockParent();
        noteBlockStart(c);
        addChild(c, B('hr'));
        return;
      }
      if (tryQuote(cur)) {
        const q = B('quote');
        const c = blockParent();
        noteBlockStart(c);
        addChild(c, q);
        open.push(q);
        cont = q;
        continue;
      }
      const lm = tryList(cur);
      if (lm && listCanInterrupt(lm, tp)) {
        if (cont.t === 'list') {
          const ok = cont.bullet === lm.bullet &&
            (cont.bullet ? cont.marker === lm.marker : cont.delim === lm.delim);
          if (!ok) {
            // different list type: close this list, use its parent
            const parent = cont.parent;
            closeBlocksBelow(open.indexOf(cont) - 1);
            cont = parent;
          }
        }
        let list = null;
        if (cont.t === 'list') list = cont;
        else {
          list = B('list');
          list.bullet = lm.bullet; list.marker = lm.marker; list.delim = lm.delim;
          list.start = lm.start; list.tight = true;
          noteBlockStart(cont);
          addChild(cont, list);
          open.push(list);
        }
        const item = B('item');
        item.contentIndent = lm.contentIndent;
        // A pending blank loosens this list when the blank item is in
        // this list OR in a list nested inside it (the blank then lies
        // between two items of this list, cm-326).
        if (blankItem && (blankItem.parent === list || isAncestorOf(list, blankItem))) list.tight = false;
        addChild(list, item);
        open.push(item);
        blankItem = null;
        cont = item;
        if (lm.empty) return;
        continue;
      }
      if (tp.t !== 'para' && tryIndentedCode(cur)) {
        const code = B('code');
        code.fenced = false; code.lines = [{ s: cur.rest(), nl: curLine.nl }];
        const c = blockParent();
        noteBlockStart(c);
        addChild(c, code);
        open.push(code);
        return;
      }
      if (tp.t === 'para') {
        noteBlockStart(cont);
        let lt = cur.rest();
        if (tp.parent && tp.parent.t === 'item') lt = stripItemParaIndent(lt, cur.col);
        else if (cur.col > 0) lt = expandLeadingTabs(lt, cur.col);
        addParaLine(tp, lt);
        return;
      }
      // A bare container marker (e.g. `>`) leaves no content: do not
      // create an empty paragraph for it.
      if (cur.blank()) return;
      const c = blockParent();
      noteBlockStart(c);
      // A first paragraph line inside a container expands leading tabs
      // to spaces (at top level a leading tab would be indented code,
      // so this only fires inside containers).
      newPara(c, cur.col > 0 ? expandLeadingTabs(cur.rest(), cur.col) : cur.rest());
      return;
    }
  }

  let curLine = { s: '', nl: false };
  let li = 0;
  for (li = 0; li < lines.length; li++) {
    curLine = lines[li];
    const cur = new Cursor(curLine.s);
    // Phase 1: container continuation
    let ci = 0;
    let stoppedAtList = false;
    while (ci + 1 < open.length) {
      const child = open[ci + 1];
      if (child.t === 'quote') {
        if (cur.blank()) break;
        const save = cur.save();
        cur.skipIndent(3);
        if (cur.cur() === '>') {
          cur.adv();
          if (cur.cur() === ' ') cur.adv();
          else if (cur.cur() === '\t') cur.advCols(1);
          ci++; continue;
        }
        cur.restore(save);
        break;
      }
      if (child.t === 'list') {
        if (cur.blank()) { ci++; continue; }
        const item = child.ch[child.ch.length - 1];
        const save = cur.save();
        if (item && !item.blankEnded && cur.advCols(item.contentIndent)) { cur.restore(save); ci++; continue; }
        cur.restore(save);
        if (matchListPeek(cur, child)) { ci++; stoppedAtList = true; break; }
        break;
      }
      if (child.t === 'item') {
        if (cur.blank()) { ci++; continue; }
        const save = cur.save();
        if (!child.blankEnded && cur.advCols(child.contentIndent)) { ci++; continue; }
        cur.restore(save);
        break;
      }
      break; // leaf block
    }
    const container = open[ci];
    const walkStoppedEarly = ci < open.length - 1;
    const blank = cur.blank();
    if (blank) {
      // A whitespace-only (non-empty) remainder on the last line continues
      // an open paragraph whose container was reached (e.g. `> foo` then
      // `>  ` at EOF keeps a single-space line in the paragraph).
      if (li === lines.length - 1 && tip().t === 'para' && cur.rest().length > 0 && ci === open.length - 2) {
        addParaLine(tip(), cur.col > 0 ? expandLeadingTabs(cur.rest(), cur.col) : cur.rest());
        continue;
      }
      const tp = tip();
      // A blank line only belongs to a code/html leaf when it continues
      // that leaf's containers; otherwise it closes the leaf (and any
      // quote holding it).
      if ((tp.t === 'code' || (tp.t === 'html' && tp.htmlType <= 5)) && ci === open.length - 2) {
        if (tp.t === 'code') {
          // Blank lines inside code keep content after stripping the block
          // indent (fence indent, character-wise, for fenced code; 4
          // columns otherwise). Leading tabs expand when the block sits
          // inside a container, as for non-blank content lines.
          const containerCol = cur.col;
          if (tp.fenced) cur.stripChars(tp.fenceIndent || 0);
          else cur.advCols(4);
          let s = cur.rest();
          if (containerCol > 0) s = expandLeadingTabs(s, cur.col);
          tp.lines.push({ s: s, nl: curLine.nl });
        } else {
          tp.lines.push({ s: '', nl: curLine.nl });
          tp.lastLine = li;
        }
      } else {
        closeBlocksBelow(ci);
        // A blank line inside a nested block quote belongs to the quote,
        // not to the enclosing list item: it does not separate two blocks
        // of the item, so it must not loosen the outer list (cm-320).
        // Only a blank directly in a list/item (container doc/list/item)
        // marks the innermost item as having seen a blank line.
        if (container.t !== 'quote') {
          const it = innermostItem();
          if (it) { it.blankPending = true; blankItem = it; if (it.ch.length === 0) it.blankEnded = true; }
        }
      }
      continue;
    }
    let tp = tip();
    // A leaf block only consumes a line that continues its containers.
    if ((tp.t === 'code' || tp.t === 'html' || tp.t === 'table') && ci !== open.length - 2) {
      closeBlocksBelow(ci);
      tp = tip();
    }
    // Leaf blocks that consume the line themselves.
    if (tp.t === 'code' && tp.fenced) {
      if (isClosingFence(cur, tp.fenceCh, tp.fenceLen)) { tp.closedByFence = true; closeBlocksBelow(ci); }
      else {
        // Strip up to the fence's indent from the content line: each
        // space or tab counts as one character, a tab is consumed whole.
        // When the block sits inside a container (the container walk
        // consumed columns), leading tabs in the remainder expand to
        // spaces at tab stops; at top level they stay raw tabs.
        const containerCol = cur.col;
        cur.stripChars(tp.fenceIndent || 0);
        let s = cur.rest();
        if (containerCol > 0) s = expandLeadingTabs(s, cur.col);
        tp.lines.push({ s: s, nl: curLine.nl });
      }
      continue;
    }
    if (tp.t === 'code') { // indented code
      const save = cur.save();
      const containerCol = cur.col;
      if (cur.advCols(4)) {
        let s = cur.rest();
        if (containerCol > 0) s = expandLeadingTabs(s, cur.col);
        tp.lines.push({ s: s, nl: curLine.nl });
        continue;
      }
      cur.restore(save);
      closeBlocksBelow(ci);
    }
    if (tp.t === 'html') {
      if (tp.htmlType <= 5 && htmlBlockEnds(tp.htmlType, cur.rest())) {
        tp.lines.push({ s: cur.rest(), nl: curLine.nl });
        tp.lastLine = li;
        closeBlocksBelow(ci);
      } else {
        tp.lines.push({ s: cur.rest(), nl: curLine.nl });
        tp.lastLine = li;
      }
      continue;
    }
    if (tp.t === 'table') {
      if (startsNewBlock(cur, tp, true)) {
        closeBlocksBelow(ci);
      } else {
        tp.rows.push(splitTableRow(cur.rest()));
        continue;
      }
    }
    // Block-start phase.
    const tp2 = tip();
    // Paragraph continuation: a line that does not start a new block is
    // added to the open paragraph. When the walk stopped at an outer
    // container (lazy continuation) leading whitespace is stripped;
    // otherwise the line is kept as-is. A line that matched an enclosing
    // list item is never a continuation.
    if (tp2.t === 'para' && !stoppedAtList && !startsNewBlock(cur, tp2, false, ci === open.length - 2) && !isOuterListMarker(cur, tp2, ci)) {
      let lineText = ci < open.length - 2 ? cur.rest().replace(/^[ \t]+/, '') : cur.rest();
      // A setext-looking lazy continuation line is paragraph text, indented
      // by four spaces (e.g. `> foo` / `bar` / `===` keeps `    ===`).
      if (ci < open.length - 2) {
        const save = cur.save();
        const isSetext = !!trySetext(cur);
        cur.restore(save);
        if (isSetext) lineText = '    ' + lineText;
      } else if (tp2.parent && tp2.parent.t === 'item') {
        // A paragraph directly inside a list item: strip a 4-column
        // indented-code indent when present, then expand leading tabs.
        lineText = stripItemParaIndent(lineText, cur.col);
      } else if (cur.col > 0) {
        // Inside a container (e.g. a blockquote) leading tabs expand to
        // spaces; at top level they stay raw.
        lineText = expandLeadingTabs(lineText, cur.col);
      }
      addParaLine(tp2, lineText);
      continue;
    }
    // Setext heading / table: convert only while the line continues the
    // paragraph's own container (the walk reached the paragraph's parent).
    if (tp2.t === 'para' && tp2.lines.length > 0 && ci === open.length - 2 && !stoppedAtList) {
      // Setext heading / table: convert while the paragraph is still open.
      const st = trySetext(cur);
      if (st) {
        const para = open.pop();
        removeFromParent(para);
        const h = B('heading');
        h.level = st.level;
        h.text = para.lines.join('\n').replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
        addChild(open[ci], h);
        continue;
      }
      if (tp2.lines.length === 1) {
        const td = parseTableDelimiter(cur);
        if (td) {
          const headCells = splitTableRow(tp2.lines[0]);
          if (headCells.length === td.align.length) {
            const para = open.pop();
            removeFromParent(para);
            const tb = B('table');
            tb.align = td.align; tb.head = headCells; tb.rows = [];
            addChild(open[ci], tb);
            open.push(tb);
            continue;
          }
        }
      }
    }
    closeBlocksBelow(ci);
    startBlocks(open[ci], cur);
  }
  // Finalize everything still open.
  while (open.length > 0) finalize(open.pop());
  return { doc: doc, refs: refs };
}

// ---------------------------------------------------------------- rendering

function renderBlock(b, refs) {
  if (b.dead) return '';
  switch (b.t) {
    case 'para':
      return '<p>' + parseInline(b.lines.join('\n'), refs) + '</p>\n';
    case 'heading':
      return '<h' + b.level + '>' + parseInline(b.text, refs) + '</h' + b.level + '>\n';
    case 'code': {
      let info = '';
      if (b.fenced && b.info) info = ' class="language-' + escHtml(resolveBackslashes(b.info).split(/[ \t]+/)[0]) + '"';
      return '<pre><code' + info + '>' + escCode(b.literal) + '</code></pre>\n';
    }
    case 'html':
      return b.literal;
    case 'hr':
      return '<hr>\n';
    case 'quote': {
      let out = '<blockquote>\n';
      for (const c of b.ch) out += renderBlock(c, refs);
      return out + '</blockquote>\n';
    }
    case 'list': {
      let out;
      if (b.bullet) out = '<ul>\n';
      else out = b.start !== 1 ? '<ol start="' + b.start + '">\n' : '<ol>\n';
      for (const c of b.ch) out += renderItem(c, b.tight, refs);
      return out + (b.bullet ? '</ul>\n' : '</ol>\n');
    }
    case 'table': {
      let out = '<table>\n<thead>\n<tr>\n';
      for (let i = 0; i < b.head.length; i++) {
        const a = b.align[i];
        out += a ? '<th align="' + a + '">' + parseInline(b.head[i], refs) + '</th>\n'
                 : '<th>' + parseInline(b.head[i], refs) + '</th>\n';
      }
      out += '</tr>\n</thead>\n';
      if (b.rows.length > 0) {
        out += '<tbody>';
        for (const row of b.rows) {
          out += '<tr>\n';
          for (let i = 0; i < b.head.length; i++) {
            const a = b.align[i];
            const cell = row[i] !== undefined ? row[i] : '';
            out += a ? '<td align="' + a + '">' + parseInline(cell, refs) + '</td>\n'
                     : '<td>' + parseInline(cell, refs) + '</td>\n';
          }
          out += '</tr>\n';
        }
        out += '</tbody>';
      }
      return out + '</table>\n';
    }
    default:
      return '';
  }
}

// Task list checkbox: [ ] / [x] / [X] at the start of the item's first paragraph.
function taskCheckbox(text) {
  if (text.length < 3 || text[0] !== '[') return null;
  const mark = text[1];
  if (mark !== ' ' && mark !== 'x' && mark !== 'X') return null;
  if (text[2] !== ']') return null;
  const after = text[3];
  if (after === ' ') return { checked: mark === 'x' || mark === 'X', cut: 4 };
  if (after === undefined || after === '\n') return { checked: mark === 'x' || mark === 'X', cut: 3 };
  return null;
}
function renderItem(item, tight, refs) {
  let out = '<li>';
  const ch = item.ch;
  // find the first paragraph child (if any) for the task checkbox
  let firstPara = null;
  for (const c of ch) { if (c.t === 'para') { firstPara = c; break; } if (c.t !== 'html' && c.t !== 'code') break; }
  let checkbox = null;
  let paraText = null;
  if (firstPara && !firstPara.dead && firstPara.lines.length > 0) {
    const text = firstPara.lines.join('\n');
    const cb = taskCheckbox(text);
    if (cb) { checkbox = cb; paraText = text.slice(cb.cut); }
  }
  const renderPara = function (para, text) {
    if (tight) return parseInline(text, refs);
    return '<p>' + parseInline(text, refs) + '</p>\n';
  };
  let doneFirst = false;
  for (const c of ch) {
    // A def-only paragraph is dead (no lines) and renders nothing (cm-317);
    // renderBlock checks this, but the para branch here did not.
    if (c.dead) continue;
    if (c === firstPara && checkbox) {
      // In a loose list the checkbox goes INSIDE the <p> (doc-01);
      // in a tight list there is no <p> so it precedes the text.
      const cbHtml = checkbox.checked
        ? '<input checked="" disabled="" type="checkbox"> '
        : '<input disabled="" type="checkbox"> ';
      if (tight) {
        out += cbHtml;
        out += renderPara(c, paraText);
      } else {
        out += '<p>' + cbHtml + parseInline(paraText, refs) + '</p>\n';
      }
      doneFirst = true;
    } else if (c.t === 'para') {
      if (tight) out += parseInline(c.lines.join('\n'), refs);
      else out += '<p>' + parseInline(c.lines.join('\n'), refs) + '</p>\n';
    } else {
      out += renderBlock(c, refs);
    }
  }
  void doneFirst;
  return out + '</li>\n';
}

export function parse(src) {
  if (typeof src !== 'string') src = String(src);
  src = src.replace(/\r\n?/g, '\n').replace(/\u0000/g, '\uFFFD');
  const { doc, refs } = parseBlocks(src);
  let out = '';
  for (const c of doc.ch) out += renderBlock(c, refs);
  return out;
}
