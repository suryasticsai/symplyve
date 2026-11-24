<div align="center">
  <img src="symplyve-logo1.png" alt="Symplyve Logo" width="150" style="border-radius: 20px; margin-bottom: 20px;" />
  
  <h1>Symplyve</h1>
  <p><strong>Elite Leave Management & Employee Dashboard</strong></p>

  <!-- Dynamic Scrolling Text -->
  <a href="https://git.io/typing-svg">
    <img src="https://readme-typing-svg.demolab.com?font=Outfit&weight=600&size=22&pause=1000&color=2563EB&center=true&vCenter=true&width=600&lines=Serverless+Architecture;Secure+PIN+Authentication;Admin+OTP+Approvals;Gantt+%26+Calendar+Views" alt="Typing SVG" />
  </a>

  <!-- Tech Stack Badges -->
  <p>
    <img src="https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D" alt="Vue.js" />
    <img src="https://img.shields.io/badge/Bootstrap-563D7C?style=for-the-badge&logo=bootstrap&logoColor=white" alt="Bootstrap" />
    <img src="https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google Apps Script" />
    <img src="https://img.shields.io/badge/Google%20Sheets-34A853?style=for-the-badge&logo=google-sheets&logoColor=white" alt="Google Sheets" />
  </p>
</div>

---

## 🌟 Overview

**Symplyve** is a next-generation, serverless leave management platform designed for high-performing teams. It replaces messy spreadsheets and endless email threads with a stunning, real-time dashboard. 

Built entirely without a traditional database, Symplyve leverages **Google Sheets as a database** via **Google Apps Script**, making it incredibly cost-effective, easy to deploy, and infinitely scalable for small to medium teams.

## ✨ Key Features

*   🔐 **Secure PIN Authentication:** Employees create a 4-6 digit PIN to securely access their private dashboard and view manager comments.
*   📅 **Dual Calendar Views:** 
    *   **Month Grid:** A beautiful, interactive FullCalendar view.
    *   **Gantt Timeline:** A custom-built timeline to instantly spot overlapping leaves and resource gaps.
*   🔑 **Admin OTP Approvals:** Admins can only approve or reject leaves by entering a 6-digit OTP sent to their email. Maximum security.
*   ✉️ **Automated Email Workflows:** Employees receive automated email receipts upon applying, and notification emails when their leave is approved/rejected.
*   💬 **Private Manager Notes:** Admins can leave contextual feedback on leaves that is *only* visible to the specific employee.
*   🎨 **Elite UI/UX:** A stunning blue-themed, mobile-responsive interface with glassmorphism, skeleton loaders, and smooth transitions.

---

## 🏗️ Architecture

Symplyve operates on a modern, serverless stack:
1.  **Frontend:** Vue 3 (Composition API) + Bootstrap 5 + FullCalendar + Chart.js.
2.  **Backend:** Google Apps Script (GAS) acts as a REST API.
3.  **Database:** Google Sheets (Leaves & Employees tabs).
4.  **Security:** SHA-256 PIN hashing, session tokens cached via `CacheService`, and Base64/URL-safe data transport.

---

## 🚀 Deployment Guide

To get your own instance of Symplyve running:

1. **Clone the Repository:**
   ```
   git clone https://github.com/suryasticsai/symplyve.git

2. Set up Google Sheets:
   · Create a new Google Sheet.
   · Go to Extensions > Apps Script.
   · Paste the contents of appscript.gs into the editor.
   · Run the setupDatabase() function once to format your sheets.
3. Deploy the API:
   · In Apps Script, click Deploy > New Deployment.
   · Select Web App. Execute as Me, Access as Anyone.
   · Copy the generated Web App URL.
4. Connect Frontend:
   · Open js/config.js and paste your Web App URL into the API_URL variable.
5. Host the Frontend:
   · Push the frontend files to GitHub and enable GitHub Pages in the repository settings.

---

<div align="center">
  <h2>👨‍💻 About the Author</h2>

  <img src="https://github.com/suryasticsai.png" alt="Sai Surya Varakala" width="120" style="border-radius: 50%; border: 4px solid #2563EB; margin-bottom: 15px;" />

<h3>Sai Surya Varakala</h3>

  <p><strong>SAFe Scrum Master at TCS | AI Techno Agilist</strong></p>

  <p>
    <em>"I built Symplyve to solve the headache of tracking team availability. What started as a simple Google Sheet evolved into this elite, serverless dashboard. I love building tools that make teams more efficient."</em>
  </p>

  <!-- Social Links -->

  <p>
    <a href="https://github.com/suryasticsai" target="_blank"><img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" /></a>
    <a href="https://Linkedin.com/In/suryasticsai" target="_blank"><img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn" /></a>
    <a href="https://huggingface.co/Spaces/Suryasticsai" target="_blank"><img src="https://img.shields.io/badge/Hugging%20Face-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face" /></a>
    <a href="https://instagram.com/suryasticsai" target="_blank"><img src="https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram" /></a>
    <a href="mailto:suryasticsai@gmail.com"><img src="https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="Email" /></a>
  </p>
</div>

---

<div align="center">
  <p>Symplyve &copy; 2026. Built for elite teams.</p>
</div>