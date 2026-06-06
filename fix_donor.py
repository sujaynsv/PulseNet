import re

with open('/tmp/DonorHome_pr5.tsx', 'r') as f:
    content = f.read()

# Add scheduledRequirement
content = content.replace(
    "const isCooldown = profile?.eligibility_status === 'not eligible';",
    "const scheduledRequirement = requirements.find(r => r.my_response_status === 'confirmed');\n  const isCooldown = profile?.eligibility_status === 'not eligible';"
)

blue_card = """
          {scheduledRequirement && (
            <div className="glass-card bg-gradient-to-br from-blue-900/40 to-slate-900 border border-blue-500/30 p-8 rounded-2xl shadow-xl flex flex-col md:flex-row items-center gap-6 mb-6">
              <div className="bg-blue-500/20 p-4 rounded-full border border-blue-500/30">
                <Calendar className="text-blue-400" size={40} />
              </div>
              <div className="flex-1 space-y-2 text-center md:text-left">
                <h2 className="text-2xl font-bold text-white tracking-tight">Donation Scheduled</h2>
                <p className="text-slate-300">You have confirmed your availability for an upcoming patient cycle.</p>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-2 text-sm">
                  <span className="bg-blue-950/50 text-blue-300 border border-blue-800 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <Calendar size={16} /> {new Date(scheduledRequirement.date_needed).toLocaleDateString()}
                  </span>
                  <span className="bg-blue-950/50 text-blue-300 border border-blue-800 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <MapPin size={16} /> {scheduledRequirement.center_name}
                  </span>
                  <span className="bg-slate-900/50 text-slate-400 border border-slate-700 px-3 py-1.5 rounded-lg">
                    Patient: <strong className="text-white ml-1">{scheduledRequirement.patient_name || 'Anonymous'}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* 3. Upcoming Donation Panel */}
"""

content = content.replace(
    "{/* 3. Upcoming Donation Panel */}",
    blue_card
)

# And if scheduledRequirement is true, hide it from the normal requirements loop? 
# Actually, the blue card looks so good we can leave the normal loop or filter it out. 
# For now let's just show it. 
# Wait, in the requirements map, PR5 shows:
# req.my_response_status === 'confirmed' -> CheckCircle "Response recorded"
# That's perfectly fine to leave there as a smaller card, but wait, the big blue card already handles it.
# Let's filter requirements in the normal loop: `requirements.filter(r => r.my_response_status !== 'confirmed').map(req =>`
content = content.replace(
    "{requirements.map(req => (",
    "{requirements.filter(r => r.my_response_status !== 'confirmed').map(req => ("
)

# Wait, if ALL requirements are confirmed, `requirements.filter` will be empty.
# In PR5, `requirements.length > 0 ? ( ... )` handles the layout.
# If we filter them and it's empty, it will show an empty div.
# Instead of complicating, let's just let it render the small card as well. 
# It serves as a good "card list" element. I won't filter it.

# Let's restore the original mapping.
content = content.replace(
    "{requirements.filter(r => r.my_response_status !== 'confirmed').map(req => (",
    "{requirements.map(req => ("
)

with open('frontend/src/pages/donor/DonorHome.tsx', 'w') as f:
    f.write(content)

