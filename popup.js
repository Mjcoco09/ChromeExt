document.getElementById("runValidator").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    // Inform the user that the floating panel on the page shows the logs.
    document.getElementById("results").textContent =
      "Validation executed. Check the floating panel on the right side of the page.";
  } catch (error) {
    console.error("Error injecting script:", error);
    document.getElementById("results").textContent = "Error: " + error.message;
  }
});
