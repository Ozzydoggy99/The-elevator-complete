async function loadSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.innerHTML = `
        <nav>
            <ul>
                <li><a href="index.html">Dashboard</a></li>
                <li><a href="robot-registration.html">Robot Registration</a></li>
                <li><a href="relay-registration.html">Relay Registration</a></li>
                <li><a href="relay-programming.html">Relay Programming</a></li>
                <li><a href="relay-assignments.html">Relay Assignments</a></li>
                <li><a href="assigned-relays.html">Assigned Relays</a></li>
                <li><a href="robot-assignment.html">Robot Assignment</a></li>
                <li><a href="user-templates.html">User Templates</a></li>
                <li><a href="robot-control.html">Robot Control</a></li>
                <li><a href="robot-monitoring.html">Robot Monitoring</a></li>
            </ul>
        </nav>
    `;
} 