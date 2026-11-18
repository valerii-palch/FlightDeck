from pathlib import Path
p=Path('index.template.html')
s=p.read_text()
def replace(a,b):
    global s
    assert a in s, a
    s=s.replace(a,b,1)
def replace_functions(start,end,new):
    global s
    a,b=s.index('function '+start+'('),s.index('function '+end+'(')
    s=s[:a]+new+'\n'+s[b:]
replace('</style>', '__EXTRA_CSS__\n</style>')
replace('<body><div', '<body><div id="splash" role="status"><div><span class="splash-mark" aria-hidden="true">✈</span><strong>FlightDesk</strong><p>Открываем маршрутный лист</p></div></div><div')
replace("'Уход на запасной','Отменен'];", "'Уход на запасной','Отменен','Задержан'];")
replace("const pages = [['center'", "const pages = [['home','Главная'],['center'")
replace("['journal','Журнал']];", "['journal','Журнал'],['pilot','Пилот']];")
replace("let page = 'center'", "let page = 'home'")
replace("journalFilter = 'all', noticeTimer", "journalFilter = 'all', regionFilter = 'all', statusFilter = 'all', detailTail = '', noticeTimer")
replace("const seed = () => JSON.parse(byId('seed').textContent);\nlet data = window.flightDeskState || seed();", """const catalog = JSON.parse(byId('seed').textContent);
const referenceCodes = new Map(catalog.airports.map(a => [a.icao, a.iata]));
function mergeCodes(state) {
 for (const a of state.airports) {
  if (!a.iata) a.iata = referenceCodes.get(a.icao) || '';
 }
 return state;
}
let data = window.flightDeskState || catalog;""")
replace('if (saved) data = JSON.parse(saved);','if (saved) data = JSON.parse(saved);\n mergeCodes(data);')
replace("  if (!line || /^-+$/.test(line) || line.startsWith('*')) continue;",r"""  if (/^\*?anyway\*?$/i.test(line)) { items.push('Любая стоянка'); continue; }
  if (!line || /^-+$/.test(line) || /^\*?inop\*?$/i.test(line) || line.startsWith('*')) continue;""")
replace_functions('standSelect','paxText',"""function standSelect(f,key,code,title) {
 const choices = stands(code), current = f[key] || '';
 const unrestricted = choices.includes('Любая стоянка');
 if (current && !choices.includes(current)) choices.unshift(current);
 const raw = airport(code)?.stands?.[aircraft().stands] || '';
 return '<label>'+title+'<select data-stand="'+key+'" '+(!choices.length?'disabled':'')+'>'+
 option('',choices.length?'Выбрать стоянку':/inop/i.test(raw)?'INOP':'Нет данных',current)+choices.map(v=>option(v,v,current)).join('')+
 (unrestricted?option('__manual','Указать номер вручную…',current):'')+'</select></label>';
}
function manualStand(f,key) {
 openDialog('<h2>Номер стоянки</h2><form id="standForm" class="stack"><label>Стоянка<input name="stand" required maxlength="40" placeholder="Например, 118A"></label><div class="controls"><button class="primary">Сохранить</button><button type="button" data-action="close">Отмена</button></div></form>');
 byId('standForm').onsubmit = event => {
  event.preventDefault();
  const value = event.target.elements.stand.value.trim();
  if (!value || value === '__manual') return;
  f[key] = value;
  save();
  byId('dialog').close();
  render();
 };
}""")
replace("const next = arriving && f.sta < f.std ? ' +1' : '';", """const times = flightTimes(f);
 const plannedStamp = arriving ? times.scheduledArrival : times.scheduledDeparture;
 const actualStamp = arriving ? times.actualArrival : times.actualDeparture;""")
a=s.index(" standSelect(f,key+'Stand'")
b=s.index('\n}',a)
s=s[:a]+""" standSelect(f,key+'Stand',code,title)+'<p class="muted">'+(arriving?'Прилет':'Вылет')+' по плану</p><strong class="time">'+stampLabel(plannedStamp,f.date)+'</strong>'+
 (actual?'<p class="facts">Факт <strong class="time">'+stampLabel(actualStamp,f.date)+'</strong> '+(arriving?delayBadge(f):'')+'</p>':'')+'<div class="controls facts">'+flags+'</div></div>';"""+s[b:]
replace("formatTime(planned,f.date)", "(Number.isFinite(planned)?formatTime(planned,f.date):'—')")
replace_functions('fleetPage','airportRows','__NEW_VIEWS__')
replace("function airportRows()", """const isDomestic = a => /^(россия|russia|russian federation|ru)$/i.test(a.country?.trim());
function airportRows()""")
replace("airportFilter==='missing'&&a.scenery&&!a.gsx))", "airportFilter==='missing'&&a.scenery&&!a.gsx) &&\n  (regionFilter==='all'||(regionFilter==='domestic')===isDomestic(a)))")
replace("""<strong>'+esc(a.icao)+(a.iata?' <small>/ '+esc(a.iata)+'</small>':'')+'</strong>""", """'+codeLabel(a.icao)+'""")
replace("""airportFilter)).join('')+'</select></div>'+""", """airportFilter)).join('')+'</select>'+
 '<select id="regionFilter" aria-label="География рейсов">'+[['all','Все направления'],['domestic','Внутренние рейсы'],['international','Международные рейсы']].map(([v,l])=>option(v,l,regionFilter)).join('')+'</select></div>'+""")
replace_functions('journal','render',"""function journal() {
 const rows = newest(data.flights.filter(f=>(journalFilter==='all'||f.tail===journalFilter) &&
  (statusFilter==='all'||statusFilter===f.status||statusFilter==='arrival'&&arrivalDelay(f)>0)));
 return '<section class="panel"><div class="controls"><select id="journalFilter" aria-label="Борт">'+option('all','Все борта',journalFilter)+fleet.map(a=>option(a.tail,a.tail+' · '+a.short,journalFilter)).join('')+'</select>'+
 '<select id="statusFilter" aria-label="Статус">'+option('all','Все статусы',statusFilter)+option('arrival','Позднее прибытие',statusFilter)+statuses.map(s=>option(s,s,statusFilter)).join('')+'</select><span class="muted">Записей '+rows.length+'</span></div>'+
 (rows.length?flightTable(rows):'<p class="empty muted">Рейсы не найдены.</p>')+'</section>';
}""")
replace("(page===id?'active':'')", "(page===id||page==='aircraft'&&id==='fleet'?'active':'')")
replace("pages.find(p=>p[0]===page)[1]", "(page==='aircraft'?detailTail:pages.find(p=>p[0]===page)[1])")
replace("({center,fleet:fleetPage,airports:airportsPage,journal}[page])()", "({home,center,fleet:fleetPage,aircraft:aircraftPage,airports:airportsPage,journal,pilot}[page])()")
replace("field('atd','Вылет фактически UTC','time')+field('ata','Прилет фактически UTC','time')+", """field('atd','Вылет фактически UTC','time')+field('ata','Прилет фактически UTC','time')+
 field('atdDate','Дата фактического вылета UTC','date')+field('ataDate','Дата фактического прилета UTC','date')+""")
replace("  for (const key of ['pax','actualMinutes'])", """  const times = flightTimes(values);
  if (values.atd && values.ata && times.actualArrival < times.actualDeparture) {
   form.elements.ataDate.setCustomValidity('Прилет должен быть после вылета.');
   form.reportValidity(); return;
  }
  for (const key of ['pax','actualMinutes'])""")
replace("data=restored;", "data=mergeCodes(restored);")
replace(" if(d.tail){", " if(d.aircraft){detailTail=d.aircraft;page='aircraft';render();}\n if(d.tail){")
replace(" if(t.id==='journalFilter')", " if(t.id==='regionFilter'){regionFilter=t.value;byId('airportRows').innerHTML=airportRows();}\n if(t.id==='statusFilter'){statusFilter=t.value;render();}\n if(t.id==='journalFilter')")
replace("if(d.stand){flight()[d.stand]=t.value;save();}", """if(d.stand){
  const f=flight();
  if(t.value==='__manual'){t.value=f[d.stand]||'';manualStand(f,d.stand);}
  else {f[d.stand]=t.value;save();}
 }""")
replace("render();\nif(!storageAvailable)", "render();\nrequestAnimationFrame(()=>requestAnimationFrame(()=>byId('splash').classList.add('ready')));\nif(!storageAvailable)")
p.write_text(s)
