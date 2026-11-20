export const formatClassroomClass = name => (/^\d+$/.test(name) ? `${name}班` : name)

export const getClassroomClassLabel = (name, classes) => {
  const label = formatClassroomClass(name)
  return label !== name && classes.includes(label) ? `${label}（原名 ${name}）` : label
}
