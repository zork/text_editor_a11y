////
// index.js
////

function $(id) {
  return document.getElementById(id);
}

var engine = null;
var timer = null;
var useAOM = false;
var a11yRootNode = null;
var a11yNodes = {};
Module['onRuntimeInitialized'] = function() {
  fetch("assets.zip").then(results => {
    return results.arrayBuffer();
  }).then(buffer => {
    // Cache the assets
    var data = new Uint8Array(buffer);
    var stream = FS.open("assets.zip", 'w');
    FS.write(stream, data, 0, data.byteLength, 0);
    FS.close(stream);

    // Add event handlers to the canvas
    const canvas = $('canvas');
    canvas.addEventListener('mousemove', onMouseMove, false);
    canvas.addEventListener('mousedown', onMouseDown, false);
    canvas.addEventListener('mouseup', onMouseUp, false);
    if (canvas.accessibleNode != undefined) {
      a11yRootNode = canvas.accessibleNode;
      a11yRootNode.role = 'region';
      a11yRootNode.id = -1;
      useAOM = true;
    } else {
      // Use DOM fallback.
      a11yRootNode = document.createElement('div');
      a11yRootNode.setAttribute('role', 'region');
      a11yRootNode.id = -1;
      canvas.appendChild(a11yRootNode);
      useAOM = false;
    }

    // Create the engine
    engine = new Module.Engine();
    engine.Create();

    // Game loop
    timer = setInterval(function() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      engine.Render(width, height);
    }, 1000.0 / 60.0);
  });
};

window.addEventListener("beforeunload", function(e) {
  if (engine) {
    clearInterval(timer);
    engine.Destroy();
    engine = null;
  }
}, false);

window.addEventListener("keydown", function(event) {
  // Prevent scrolling and tabbing out of web content.
  if(["Tab", "ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(event.code) > -1) {
    event.preventDefault();
  }

  // Allow Space to go to EditContext, but not scroll the page.
  if(!document.activeElement.editContext && ["Space"].indexOf(event.code) > -1) {
    event.preventDefault();
  }

  if (engine) {
    engine.OnKeyDown(event.keyCode);
    if (event.key.length == 1) {
      engine.OnKeyChar(event.key);
    }
  }
}, false);

window.addEventListener("keyup", function(event) {
  if (engine) {
    engine.OnKeyUp(event.keyCode);
  }
}, false);

function onMouseMove(event) {
  if (engine) {
    engine.OnMouseMove(event.layerX, event.layerY,
        event.movementX, event.movementY);
  }
}

function onMouseDown(event) {
  if (engine) {
    engine.OnMouseDown(event.button + 1, event.layerX, event.layerY);
  }
}

function onMouseUp(event) {
  if (engine) {
    engine.OnMouseUp(event.button + 1, event.layerX, event.layerY);
  }
}

function debugRefreshA11yTree() {
  a11yInvalidateView(-1);
}

function debugPrintA11yTree() {
  if (useAOM) {
    printA11yTree(a11yRootNode, "");
  } else {
    console.log("AOM not enabled");
  }
}

function printA11yTree(node, indent) {
  if (node.id != -1) {
    console.log(indent + node.id + ": " + node.label);
    indent = indent + '-';
  }
  for (var i = 0; i < node.childNodes.length; i++) {
    printA11yTree(node.childNodes[i], indent);
  }
}

function getAccessibilityNode(id) {
  if (id == -1) {
    return a11yRootNode;
  } else {
    return a11yNodes[id];
  }
}

function resetAccessibilityNode(node) {
  if (useAOM) {
    node.offsetLeft = 0;
    node.offsetTop = 0;
    node.offsetWidth = 0;
    node.offsetHeight = 0;

    node.label = "";
    node.live = "off";
    node.role = "region";
  } else {
    node.ariaLabel = "";
    node.ariaLive = "off";
    node.setAttribute('role', 'region');
  }

  deleteAccessibilityNodeChildren(node);
}

function deleteAccessibilityNodeChildren(node) {
  while (node.childNodes.length > 0) {
    deleteAccessibilityNode(node.childNodes[0]);
    node.removeChild(node.childNodes[0]);
  }
}

function deleteAccessibilityNode(node) {
  deleteAccessibilityNodeChildren(node);
  delete a11yNodes[node.id];
}

function a11yInvalidateView(id) {
  var node = getAccessibilityNode(id);
  if (node) {
    resetAccessibilityNode(node);
    setupAccessibilityNode(id, node);
  }
}

function a11yRefreshView(id) {
  var node = getAccessibilityNode(id);
  if (node) {
    engine.SetupAccessibilityNode(id, node, useAOM);
  }
}

function a11yFocusView(id) {
  if (useAOM) {
    // TODO: Support AOM
  } else {
    if (id == -1) {
      document.activeElement.blur();
    } else {
      var node = getAccessibilityNode(id);
      if (node) {
        node.focus();
      }
    }
  }
}

function setupAccessibilityNode(id, node) {
  if (id != -1) {
    engine.SetupAccessibilityNode(id, node, useAOM);
    if (!useAOM) {
      if (engine.IsClickable(id)) {
        node.addEventListener('click', (e) => {
          console.log("Click sent from AT");
          engine.ClickView(id);
        });
      }
    }
  }
  setupAccessibilityChildNodes(id, node);
  // TODO: IsClickable
}

function startTextEdit(id, text, selectionStart, selectionEnd) {
  if (typeof(EditContext) == 'undefined') {
    return false;
  }

  var node = getAccessibilityNode(id);
  if (!node) {
    console.log("startTextEdit missing node: " + id);
    return false;
  }

  const editContext = new EditContext({"text": text,
                                       "selectionStart": selectionStart,
                                       "selectionEnd": selectionEnd});
  node.editContext = editContext;

  editContext.addEventListener('textupdate', (e) => {
    console.log(e);
    if (engine) {
      engine.OnTextUpdate(e.updateText, e.updateRangeStart, e.updateRangeEnd,
                          e.newSelectionStart, e.newSelectionEnd);
    }
  });

  return true;
}

function stopTextEdit(id) {
  var node = getAccessibilityNode(id);
  if (!node) {
    console.log("stopTextEdit missing node: " + id);
    return false;
  }
  node.editContext = null;
}

function updateTextEditText(start, end, text) {
  var ec = document.activeElement.editContext;
  if (ec) {
    ec.updateText(start, end, text);
  }
}

function updateTextEditSelection(start, end) {
  var ec = document.activeElement.editContext;
  if (ec) {
    ec.updateSelection(start, end);
  }
}

function lockMouse() {
  $('canvas').requestPointerLock();
}

function unlockMouse() {
  document.exitPointerLock();
}

function setupAccessibilityChildNodes(id, node) {
  var children = engine.GetChildViewIds(id);
  children.forEach(function(childId) {
    var childNode;
    if (useAOM) {
      childNode = new AccessibleNode();
      childNode.offsetParent = node;
    } else {
      childNode = document.createElement('div');
    }
    childNode.id = childId;
    a11yNodes[childId] = childNode;
    setupAccessibilityNode(childId, childNode);
    node.appendChild(childNode);
  });
}

function onHttpData(requestId, response, buffer) {
  var uint8Buffer = new Uint8Array(buffer);
  var data;
  try {
    data = Module._malloc(uint8Buffer.length);
    Module.HEAPU8.set(uint8Buffer, data);
    Module.ccall("OnHttpRequestData", null, ["number", "number", "number"],
                 [requestId, data, uint8Buffer.length])
  } finally {
    Module._free(data);
    Module.HttpRequest.OnRequestComplete(requestId, response.status);
  }
}

function onHttpError(requestId, error) {
  console.error(error);
  Module.HttpRequest.OnRequestComplete(requestId, 0);
}
