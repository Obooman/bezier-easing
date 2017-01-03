/**
 * https://github.com/gre/bezier-easing
 * BezierEasing - use bezier curve for transition easing function
 * by Gaëtan Renaudeau 2014 - 2015 – MIT License
 */

// These values are established by empiricism with tests (tradeoff: performance VS precision)
// 以下各值经过测试权衡 (性能与精确性)
var NEWTON_ITERATIONS = 4;// 牛顿迭代法计算最大次数
var NEWTON_MIN_SLOPE = 0.001;// 牛顿迭代法保证函数曲线单调性的最小斜率
var SUBDIVISION_PRECISION = 0.0000001;// 二分法精度
var SUBDIVISION_MAX_ITERATIONS = 10;// 二分最大迭代数

var kSplineTableSize = 11;// 预处理取样个数
var kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

var float32ArraySupported = typeof Float32Array === 'function';

function A (aA1, aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1; }
function B (aA1, aA2) { return 3.0 * aA2 - 6.0 * aA1; }
function C (aA1)      { return 3.0 * aA1; }

// Returns x(t) given t, x1, and x2, or y(t) given t, y1, and y2.
// 给定t，控制点坐标，返回对应线上点的x或者y坐标
function calcBezier (aT, aA1, aA2) { return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT; }

// Returns dx/dt given t, x1, and x2, or dy/dt given t, y1, and y2.
// 求导公式计算出当前点斜率
function getSlope (aT, aA1, aA2) { return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1); }

// 二分法
function binarySubdivide (aX, aA, aB, mX1, mX2) {
  var currentX, currentT, i = 0;
  
  do {
    // 二分比较逻辑
    currentT = aA + (aB - aA) / 2.0;
    currentX = calcBezier(currentT, mX1, mX2) - aX;
    if (currentX > 0.0) {
      aB = currentT;
    } else {
      aA = currentT;
    }
    // 迭代条件:当迭代变量小于最大迭代次数 且 当前差值大于最小精度
  } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
  return currentT;
}

// 牛顿迭代法
function newtonRaphsonIterate (aX, aGuessT, mX1, mX2) {
 for (var i = 0; i < NEWTON_ITERATIONS; ++i) {
   var currentSlope = getSlope(aGuessT, mX1, mX2);
   if (currentSlope === 0.0) {
     return aGuessT;
   }
   var currentX = calcBezier(aGuessT, mX1, mX2) - aX;
   aGuessT -= currentX / currentSlope;
 }
 return aGuessT;
}

module.exports = function bezier (mX1, mY1, mX2, mY2) {
  if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) {
    throw new Error('bezier x values must be in [0, 1] range');
  }

  // Precompute samples table
  // 预计算值表
  var sampleValues = float32ArraySupported ? new Float32Array(kSplineTableSize) : new Array(kSplineTableSize);
  
  // 非直线
  if (mX1 !== mY1 || mX2 !== mY2) {
    
    // i*kSampleStepSize即为t，及取样比例点
    // 此处求得将[0,1]均分十份后每一份取样点对应的x值
    // 即sampleValues所存储值为取样的十个x坐标，对应的t为index*0.1
    for (var i = 0; i < kSplineTableSize; ++i) {
      sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
    }
  }

  // 给定x值计算得出t
  function getTForX (aX) {
    var intervalStart = 0.0;// 当前t值
    var currentSample = 1;// 迭代变量
    var lastSample = kSplineTableSize - 1;// 对比变量，最后一个点

    // 循环条件:当前非最后一个值 且 当前值小于等于x值(在目标点左方)
    for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
      // 依次向下取t
      intervalStart += kSampleStepSize;
    }
    
    // 不满足条件的一次递增需要自减抵消
    --currentSample;

    // Interpolate to provide an initial guess for t
    // 初始t的猜测值
    // intervalStart为小于x样本中最接近x的值
    //                  x与样值的差值               /           下个值样值的差值
    var dist = (aX - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);

    //                当前t值    +  比例*步距
    var guessForT = intervalStart + dist * kSampleStepSize;

    var initialSlope = getSlope(guessForT, mX1, mX2);

    if (initialSlope >= NEWTON_MIN_SLOPE) {    // 区间内单调
      return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
    } else if (initialSlope === 0.0) {
      return guessForT;
    } else {
      //                     给定的x, 当前t值,     下一t值，              一控制点x坐标,二控制点x坐标,
      return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
    }
  }

  return function BezierEasing (x) {
    
    // 线性变化
    if (mX1 === mY1 && mX2 === mY2) {
      return x; // linear
    }
    // Because JavaScript number are imprecise, we should guarantee the extremes are right.

    // 左端点
    if (x === 0) {
      return 0;
    }
    
    // 右端点
    if (x === 1) {
      return 1;
    }
    return calcBezier(getTForX(x), mY1, mY2);
  };
};
