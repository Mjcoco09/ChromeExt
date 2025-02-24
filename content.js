(function () {
  // Remove any existing floating panel (clearing previous logs)
  let oldPanel = document.getElementById("shiftValidatorPanel");
  if (oldPanel) {
    oldPanel.remove();
  }

  // Create the floating panel
  const panel = document.createElement("div");
  panel.id = "shiftValidatorPanel";
  panel.innerHTML = `
      <div id="shiftValidatorHeader">
        <span>Shift Validator Logs</span>
        <button id="shiftValidatorClose">&times;</button>
      </div>
      <div id="shiftValidatorContent"></div>
    `;

  // Apply styles to the panel
  panel.style.position = "fixed";
  panel.style.top = "10px";
  panel.style.right = "10px";
  panel.style.width = "400px";
  panel.style.maxHeight = "80vh";
  panel.style.backgroundColor = "#fff";
  panel.style.border = "1px solid #ccc";
  panel.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
  panel.style.zIndex = "10000";
  panel.style.borderRadius = "5px";
  panel.style.overflow = "hidden";
  panel.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

  // Style header
  const header = panel.querySelector("#shiftValidatorHeader");
  header.style.backgroundColor = "#007bff";
  header.style.color = "#fff";
  header.style.padding = "10px";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  // Style close button
  const closeButton = panel.querySelector("#shiftValidatorClose");
  closeButton.style.background = "transparent";
  closeButton.style.border = "none";
  closeButton.style.color = "#fff";
  closeButton.style.fontSize = "18px";
  closeButton.style.cursor = "pointer";

  // Style content area
  const contentElem = panel.querySelector("#shiftValidatorContent");
  contentElem.style.padding = "10px";
  contentElem.style.overflowY = "auto";
  contentElem.style.maxHeight = "300px";
  contentElem.style.fontSize = "14px";
  contentElem.style.whiteSpace = "pre-wrap";

  // Append panel to the document
  document.body.appendChild(panel);

  // Attach event to close button to remove the panel
  closeButton.addEventListener("click", function () {
    panel.remove();
  });

  // ----- Begin Shift Validation Code -----

  function normalizeName(name) {
    const [last, first] = String(name).split(/,\s*/);
    return last && first
      ? `${last}, ${first}`.toLowerCase()
      : name.toLowerCase();
  }

  function parseShiftData(oldTitle) {
    // Parse task
    const taskMatch = oldTitle.match(/Task:\s*([^<]+)/i);
    const task = taskMatch ? taskMatch[1].trim() : "";

    // Parse individuals
    const individuals = [];
    const individualRegex = /(\w+,\s*\w+)(?:<br|$)/gi;
    let match;
    while ((match = individualRegex.exec(oldTitle)) !== null) {
      individuals.push(match[1].trim());
    }

    // Parse duration with 24-hour support
    const timeMatch = oldTitle.match(
      /(\d{1,2}:\d{2} [AP]M) to (\d{1,2}:\d{2} [AP]M)/i
    );
    let durationMinutes = null;

    if (timeMatch) {
      const parseTime = (timeStr) => {
        const [_, hour, minute, period] =
          timeStr.match(/(\d+):(\d+) ([AP]M)/i) || [];
        if (!hour) return NaN;
        let hours = parseInt(hour);
        const minutes = parseInt(minute);
        // Convert to 24-hour format
        if (period?.toUpperCase() === "PM" && hours < 12) hours += 12;
        if (period?.toUpperCase() === "AM" && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };

      const start = parseTime(timeMatch[1]);
      const end = parseTime(timeMatch[2]);

      if (!isNaN(start) && !isNaN(end)) {
        durationMinutes = end >= start ? end - start : 1440 - start + end;
      }
    }

    return {
      task,
      individuals: individuals.map(normalizeName),
      rawIndividuals: individuals,
      durationMinutes,
    };
  }

  function validateShift(scheduledShift, workedShift, employeeName) {
    const errors = [];

    // If there's a scheduled shift but no worked shift, record an error.
    if (scheduledShift && !workedShift) {
      errors.push(`${employeeName}: SHIFT WORKED IS MISSING`);
      return errors;
    }

    // If one or both shifts are missing, nothing to validate.
    if (!scheduledShift || !workedShift) return errors;

    const scheduled = parseShiftData(scheduledShift.getAttribute("oldtitle"));
    const worked = parseShiftData(workedShift.getAttribute("oldtitle"));

    // Task validation
    if (worked.task !== scheduled.task) {
      errors.push(
        `${employeeName}: TASK MISMATCH\n  Scheduled: "${scheduled.task}"\n  Worked:    "${worked.task}"`
      );
    }

    // Individual validation
    worked.rawIndividuals.forEach((person) => {
      if (!scheduled.individuals.includes(normalizeName(person))) {
        errors.push(
          `${employeeName}: UNAUTHORIZED\n  Found:     "${person}"\n  Allowed:   ${scheduled.rawIndividuals
            .filter((name) => !/\d/.test(name))
            .join(", ")}`
        );

        // errors.push(
        //   `${employeeName}: UNAUTHORIZED\n  Found:     "${person}"\n  Allowed:   ${scheduled.rawIndividuals.join(
        //     ", "
        //   )}`
        // );
      }
    });

    // Duration validation (flag if difference is 15 minutes or more)
    if (
      scheduled.durationMinutes !== null &&
      worked.durationMinutes !== null &&
      Math.abs(worked.durationMinutes - scheduled.durationMinutes) >= 15
    ) {
      const format = (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}hr${h !== 1 ? "s" : ""} ${m}min`;
      };
      errors.push(
        `${employeeName}: DURATION DIFFERENCE\n  Scheduled: ${format(
          scheduled.durationMinutes
        )}\n  Worked:    ${format(worked.durationMinutes)}`
      );
    }

    return errors;
  }

  function validateAllShifts() {
    let allErrors = [];

    // Only process visible containers to avoid validating other days' data.
    document
      .querySelectorAll(".timeCardEntryAnalysisContainer")
      .forEach((container) => {
        if (container.offsetParent === null) return; // Skip hidden containers

        // Find employee header and the userName element
        let employeeHeader = container.previousElementSibling;
        while (
          employeeHeader &&
          !employeeHeader.classList.contains("analysisHeader")
        ) {
          employeeHeader = employeeHeader.previousElementSibling;
        }
        const userNameElement = employeeHeader?.querySelector(".userName");
        const employeeName =
          userNameElement?.textContent?.trim() || "UNKNOWN EMPLOYEE";

        const scheduledTimeline = container.querySelector(
          ".timeLine.scheduled"
        );
        const workedTimeline = container.querySelector(".timeLine.worked");

        // If no scheduled timeline is found, skip this container.
        if (!scheduledTimeline) return;

        const scheduledShifts = [
          ...scheduledTimeline.querySelectorAll(".time.scheduled"),
        ];
        const workedShifts = workedTimeline
          ? [...workedTimeline.querySelectorAll(".time.worked")]
          : [];

        let missingShiftFound = false;

        scheduledShifts.forEach((scheduledShift, index) => {
          const workedShift = workedShifts[index];
          const errors = validateShift(
            scheduledShift,
            workedShift,
            employeeName
          );

          if (errors.length > 0) {
            // If there's a missing worked shift error, set flag to add border to the name.
            if (
              !workedShift &&
              errors.some((e) => e.includes("SHIFT WORKED IS MISSING"))
            ) {
              missingShiftFound = true;
            }
            // Highlight the worked shift if available.
            if (workedShift) {
              workedShift.style.border = "3px solid red";
            }
            errors.forEach((error) => {
              console.error(`${error}\n${"-".repeat(60)}`);
              allErrors.push(error);
            });
          }
        });
        // Add red border to the employee name if any shift is missing.
        if (missingShiftFound && userNameElement) {
          userNameElement.style.border = "2px solid red";
          userNameElement.style.padding = "2px";
        }
      });
    return allErrors;
  }

  // Run validation and update the floating panel's content.
  const logs = validateAllShifts();
  if (logs.length > 0) {
    contentElem.textContent = logs.join("\n\n");
  } else {
    contentElem.textContent = "No issues found.";
  }

  // Optionally return the logs
  return logs;
  // ----- End Shift Validation Code -----
})();
