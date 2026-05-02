importScripts("../vendor/cube.js", "../vendor/solve.js");

let ready = false;

function ensureReady() {
  if (!ready) {
    Cube.initSolver();
    ready = true;
  }
}

function countMoves(solution) {
  const trimmed = (solution || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function safeSolve(cube, maxDepth) {
  try {
    return cube.solve(maxDepth);
  } catch (error) {
    return null;
  }
}

function solveAlgorithm(algorithm, options) {
  const { refine, upperBoundSolution = "", probeLimit = 0 } = options;
  const cube = new Cube();

  if (algorithm && algorithm.trim()) {
    cube.move(algorithm);
  }

  if (cube.isSolved()) {
    return {
      solution: "",
      moves: 0,
      refined: true
    };
  }

  ensureReady();

  let best = upperBoundSolution;
  let bestLength = countMoves(best);
  let refined = false;
  const solverCandidate = safeSolve(cube, 22);
  const solverLength = countMoves(solverCandidate);

  if (solverCandidate && solverLength > 0 && (!bestLength || solverLength < bestLength)) {
    best = solverCandidate;
    bestLength = solverLength;
    refined = true;
  }

  if (refine && bestLength > 1 && probeLimit > 0) {
    const maxProbeDepth = Math.min(probeLimit, bestLength - 1);

    for (let depth = 1; depth <= maxProbeDepth; depth += 1) {
      const candidate = safeSolve(cube, depth);
      const candidateLength = countMoves(candidate);

      if (candidate && candidateLength > 0 && candidateLength < bestLength) {
        best = candidate;
        bestLength = candidateLength;
        refined = true;
      }
    }
  }

  return {
    solution: best,
    moves: bestLength,
    refined
  };
}

self.onmessage = (event) => {
  const { id, algorithm, refine = false, upperBoundSolution = "", probeLimit = 0 } = event.data;

  try {
    const startedAt = performance.now();
    const result = solveAlgorithm(algorithm, { refine, upperBoundSolution, probeLimit });

    self.postMessage({
      id,
      ok: true,
      elapsed: Math.round(performance.now() - startedAt),
      ...result
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error.message || "Solver error",
      solution: "",
      moves: null
    });
  }
};
